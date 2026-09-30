import pg from "pg";
import { parse } from "pg-connection-string";
import { validatePosConfig, type PosConfig } from "@/lib/pos-config";
import type { DisplayCard, MoneyCard, StoredSnapshot, TicketBoard } from "@/lib/types";

const { Pool } = pg;
const LOCK_KEY = 8602026;

const ENSURE_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS dashboard_snapshots (
      id integer PRIMARY KEY CHECK (id = 1),
      payload jsonb NOT NULL,
      square_state jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS dashboard_pos_config (
      id integer PRIMARY KEY CHECK (id = 1),
      cards jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  "ALTER TABLE dashboard_pos_config ENABLE ROW LEVEL SECURITY",
  "REVOKE ALL ON TABLE dashboard_pos_config FROM PUBLIC",
  `
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE dashboard_pos_config FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE dashboard_pos_config FROM authenticated';
      END IF;
    END $$
  `,
];

const DIRECT_SUPABASE_HOST = /^db\.([a-z0-9]+)\.supabase\.co\.?$/i;

export type DatabaseTarget = {
  host: string;
  port: number;
  user?: string;
  password?: string;
  database?: string;
};

function looseConnection(connectionString: string): DatabaseTarget {
  const match = connectionString.match(
    /^[a-z][a-z0-9+.-]*:\/\/([^:/?#]+):([\s\S]+)@([^:/?#]+)(?::(\d+))?(\/[^?#]*)?/i,
  );
  if (!match) return { host: "", port: 5432 };
  return {
    user: decodeURIComponent(match[1]),
    password: decodeURIComponent(match[2]),
    host: match[3] ?? "",
    port: match[4] ? Number(match[4]) : 5432,
    database: match[5]?.replace(/^\//, "") || undefined,
  };
}

/**
 * The direct Supabase host is IPv6-only. Vercel is IPv4-only, so that host
 * never answers and the card save times out. Parts are returned separately so a
 * password containing # or @ still reaches the IPv4 session pooler.
 */
export function dashboardConnectionParts(connectionString: string): DatabaseTarget {
  const raw = connectionString.trim().replace(/^['"]|['"]$/g, "");
  let parsed: DatabaseTarget;
  try {
    const config = parse(raw);
    parsed = {
      host: config.host ?? "",
      port: config.port ? Number(config.port) : 5432,
      user: config.user ?? undefined,
      password: config.password ?? undefined,
      database: config.database ?? undefined,
    };
  } catch {
    parsed = { host: "", port: 5432 };
  }
  if (!parsed.host || parsed.host === "base") parsed = looseConnection(raw);

  const match = parsed.host.match(DIRECT_SUPABASE_HOST);
  if (!match) return parsed;
  const ref = match[1];
  const user = parsed.user && !parsed.user.includes(".") ? `${parsed.user}.${ref}` : parsed.user;
  return {
    ...parsed,
    user,
    host: process.env.DASHBOARD_SUPABASE_POOLER_HOST || "aws-0-us-east-1.pooler.supabase.com",
    port: parsed.port === 6543 ? 6543 : 5432,
  };
}

export function dashboardDatabaseHost(): string {
  const connectionString = process.env.DASHBOARD_DATABASE_URL;
  if (!connectionString) return "unset";
  return dashboardConnectionParts(connectionString).host || "unreadable";
}

export function databaseIdentity(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port}${url.pathname}`;
  } catch {
    return connectionString;
  }
}

export function assertDashboardIsSeparate(): void {
  const festival = process.env.FESTIVAL_DATABASE_URL;
  const dashboard = process.env.DASHBOARD_DATABASE_URL;
  if (!festival || !dashboard) return;
  if (databaseIdentity(festival) === databaseIdentity(dashboard)) {
    throw new Error("DASHBOARD_DATABASE_URL must be a different database from the festival app");
  }
}

function sslFor(host: string): pg.ConnectionConfig["ssl"] {
  if (host === "localhost" || host === "127.0.0.1") return undefined;
  return { rejectUnauthorized: false };
}

let dashboardPool: pg.Pool | null = null;
let festivalPool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function poolFrom(connectionString: string, max: number): pg.PoolConfig {
  const parts = dashboardConnectionParts(connectionString);
  return {
    host: parts.host,
    port: parts.port,
    user: parts.user,
    password: parts.password,
    database: parts.database,
    max,
    ssl: sslFor(parts.host),
    connectionTimeoutMillis: 8_000,
    query_timeout: 15_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  };
}

function dashboardConnectionString(): string {
  const connectionString = process.env.DASHBOARD_DATABASE_URL;
  if (!connectionString) throw new Error("DASHBOARD_DATABASE_URL is not set");
  assertDashboardIsSeparate();
  return connectionString;
}

export function getDashboardPool(): pg.Pool {
  const connectionString = dashboardConnectionString();
  if (!dashboardPool) {
    dashboardPool = new Pool(poolFrom(connectionString, 1));
  }
  return dashboardPool;
}

export function getFestivalPool(): pg.Pool {
  const connectionString = process.env.FESTIVAL_DATABASE_URL;
  if (!connectionString) throw new Error("FESTIVAL_DATABASE_URL is not set");
  assertDashboardIsSeparate();
  if (!festivalPool) {
    const config = poolFrom(connectionString, 1);
    if (!String(config.host).includes("pooler.supabase.com")) {
      config.options = "-c default_transaction_read_only=on -c statement_timeout=15000";
    }
    festivalPool = new Pool(config);
  }
  return festivalPool;
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const pool = getDashboardPool();
      for (const statement of ENSURE_STATEMENTS) {
        await pool.query(statement);
      }
    })().catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function asMoney(value: unknown): MoneyCard {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const status = record.status;
  return {
    cents: typeof record.cents === "number" ? record.cents : null,
    quantity: typeof record.quantity === "number" ? record.quantity : null,
    asOf: typeof record.asOf === "string" ? record.asOf : null,
    status: status === "ok" || status === "stale" || status === "error" || status === "unconfigured" ? status : "error",
    error: typeof record.error === "string" ? record.error : null,
  };
}

function legacyCards(payload: Record<string, unknown>): DisplayCard[] | null {
  if (!payload.beer || !payload.merch || !payload.food) return null;
  return [
    { id: "beer", label: "Beer", ...asMoney(payload.beer) },
    { id: "merch", label: "Merch", ...asMoney(payload.merch) },
    { id: "food", label: "Food", ...asMoney(payload.food) },
  ];
}

function asCards(payload: Record<string, unknown>): DisplayCard[] {
  if (Array.isArray(payload.cards)) {
    return payload.cards.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.label !== "string") return [];
      const quantityLabel = typeof record.quantityLabel === "string" ? record.quantityLabel.trim() : "";
      return [{ id: record.id, label: record.label, quantityLabel: quantityLabel || null, ...asMoney(record) }];
    });
  }
  return legacyCards(payload) ?? [];
}

function coerceSnapshot(payload: unknown, squareState: unknown): StoredSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const tickets = record.tickets;
  if (!tickets || typeof tickets !== "object") return null;
  return {
    public: {
      generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : new Date(0).toISOString(),
      tickets: tickets as TicketBoard,
      cards: asCards(record),
    },
    squareState: squareState && typeof squareState === "object" ? (squareState as StoredSnapshot["squareState"]) : null,
  };
}

export async function readStoredSnapshot(): Promise<StoredSnapshot | null> {
  await ensureSchema();
  const result = await getDashboardPool().query<{ payload: StoredSnapshot["public"]; square_state: StoredSnapshot["squareState"] }>(
    "SELECT payload, square_state FROM dashboard_snapshots WHERE id = 1",
  );
  const row = result.rows[0];
  if (!row) return null;
  return coerceSnapshot(row.payload, row.square_state);
}

export async function writeStoredSnapshot(snapshot: StoredSnapshot): Promise<void> {
  await ensureSchema();
  await getDashboardPool().query(
    `
      INSERT INTO dashboard_snapshots (id, payload, square_state, updated_at)
      VALUES (1, $1::jsonb, $2::jsonb, now())
      ON CONFLICT (id) DO UPDATE
      SET payload = EXCLUDED.payload,
          square_state = EXCLUDED.square_state,
          updated_at = now()
    `,
    [JSON.stringify(snapshot.public), JSON.stringify(snapshot.squareState)],
  );
}

export async function readPosConfig(): Promise<PosConfig | null> {
  await ensureSchema();
  const result = await getDashboardPool().query<{ cards: unknown }>(
    "SELECT cards FROM dashboard_pos_config WHERE id = 1",
  );
  const row = result.rows[0];
  if (!row) return null;
  return validatePosConfig(row.cards);
}

export async function writePosConfig(config: PosConfig): Promise<void> {
  await ensureSchema();
  await getDashboardPool().query(
    `
      INSERT INTO dashboard_pos_config (id, cards, updated_at)
      VALUES (1, $1::jsonb, now())
      ON CONFLICT (id) DO UPDATE
      SET cards = EXCLUDED.cards,
          updated_at = now()
    `,
    [JSON.stringify(config.cards)],
  );
}

export async function withDashboardLock<T>(work: () => Promise<T>): Promise<{ skipped: true } | { skipped: false; result: T }> {
  const client = await getDashboardPool().connect();
  let locked = false;
  try {
    try {
      const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
      locked = Boolean(result.rows[0]?.locked);
    } catch (error) {
      console.error("Snapshot lock unavailable; continuing without it", error);
      locked = true;
    }
    if (!locked) return { skipped: true };
    const result = await work();
    return { skipped: false, result };
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
      } catch (error) {
        console.error("Snapshot unlock failed", error);
      }
    }
    client.release();
  }
}
