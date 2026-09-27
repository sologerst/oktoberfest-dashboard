import pg from "pg";
import type { StoredSnapshot } from "@/lib/types";

const { Pool } = pg;
const LOCK_KEY = 8602026;

const ENSURE_SQL = `
  CREATE TABLE IF NOT EXISTS dashboard_snapshots (
    id integer PRIMARY KEY CHECK (id = 1),
    payload jsonb NOT NULL,
    square_state jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

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

function sslFor(connectionString: string): pg.ConnectionConfig["ssl"] {
  try {
    const host = new URL(connectionString).hostname;
    if (host === "localhost" || host === "127.0.0.1") return undefined;
  } catch {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: false };
}

let dashboardPool: pg.Pool | null = null;
let festivalPool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function dashboardConnectionString(): string {
  const connectionString = process.env.DASHBOARD_DATABASE_URL;
  if (!connectionString) throw new Error("DASHBOARD_DATABASE_URL is not set");
  assertDashboardIsSeparate();
  return connectionString;
}

export function getDashboardPool(): pg.Pool {
  const connectionString = dashboardConnectionString();
  if (!dashboardPool) {
    dashboardPool = new Pool({ connectionString, max: 2, ssl: sslFor(connectionString) });
  }
  return dashboardPool;
}

export function getFestivalPool(): pg.Pool {
  const connectionString = process.env.FESTIVAL_DATABASE_URL;
  if (!connectionString) throw new Error("FESTIVAL_DATABASE_URL is not set");
  assertDashboardIsSeparate();
  if (!festivalPool) {
    festivalPool = new Pool({
      connectionString,
      max: 1,
      ssl: sslFor(connectionString),
      options: "-c default_transaction_read_only=on -c statement_timeout=15000",
    });
  }
  return festivalPool;
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getDashboardPool()
      .query(ENSURE_SQL)
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  await schemaReady;
}

export async function readStoredSnapshot(): Promise<StoredSnapshot | null> {
  await ensureSchema();
  const result = await getDashboardPool().query<{ payload: StoredSnapshot["public"]; square_state: StoredSnapshot["squareState"] }>(
    "SELECT payload, square_state FROM dashboard_snapshots WHERE id = 1",
  );
  const row = result.rows[0];
  if (!row) return null;
  return { public: row.payload, squareState: row.square_state };
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
