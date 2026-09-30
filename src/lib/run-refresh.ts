import { getFestivalPool, readPosConfig, withDashboardLock, readStoredSnapshot, writeStoredSnapshot } from "@/lib/db";
import { loadPosConfig, type PosCardConfig, type PosConfig } from "@/lib/pos-config";
import { buildSnapshot } from "@/lib/refresh";
import { pullPos } from "@/lib/square";
import { chicagoDate } from "@/lib/time";
import { loadTicketNumbers } from "@/lib/tickets";
import type { StoredSnapshot } from "@/lib/types";

const unreadConfig: PosConfig = {
  cards: (["beer", "merch", "food"] as const).map((id) => ({
    id,
    label: id === "beer" ? "Beer" : id === "merch" ? "Merch" : "Food",
    locationIds: ["unreadable"],
    catalogObjectIds: [],
    categoryIds: [],
    countItemIds: [],
    countLabel: "",
    rollsUp: [],
  })),
};

async function activeConfig(): Promise<{ config: PosConfig; error: Error | null }> {
  try {
    const stored = await readPosConfig();
    if (stored) return { config: stored, error: null };
  } catch (error) {
    return { config: unreadConfig, error: error instanceof Error ? error : new Error("POS config could not be read") };
  }
  try {
    return { config: loadPosConfig(), error: null };
  } catch (error) {
    return { config: unreadConfig, error: error instanceof Error ? error : new Error("POS config could not be read") };
  }
}

function fallbackConfig(config: PosConfig | null): PosConfig {
  if (config) return config;
  try {
    return loadPosConfig();
  } catch (error) {
    console.error("POS config file read failed", error);
    return unreadConfig;
  }
}

/** Ticket and Square reads that do not require the snapshot database. */
export async function loadFreshSnapshot(
  now: Date,
  config: PosConfig | null,
  previous: StoredSnapshot | null = null,
): Promise<StoredSnapshot> {
  const resolved = fallbackConfig(config);
  return buildSnapshot({
    now,
    previous,
    config: resolved,
    loadTickets: () => loadTicketNumbers(getFestivalPool(), chicagoDate(now)),
    loadSquare: (state) =>
      pullPos({
        config: resolved,
        state,
        now,
        token: process.env.SQUARE_ACCESS_TOKEN ?? null,
        environment: process.env.SQUARE_ENVIRONMENT ?? null,
      }),
  });
}

export async function runRefresh(now = new Date()): Promise<{ skipped: true } | { skipped: false; snapshot: StoredSnapshot }> {
  try {
    const locked = await withDashboardLock(async () => {
      const previous = await readStoredSnapshot();
      const { config, error: configError } = await activeConfig();

      const snapshot = await buildSnapshot({
        now,
        previous,
        config,
        loadTickets: () => loadTicketNumbers(getFestivalPool(), chicagoDate(now)),
        loadSquare: (state) => {
          if (configError) throw configError;
          return pullPos({
            config,
            state,
            now,
            token: process.env.SQUARE_ACCESS_TOKEN ?? null,
            environment: process.env.SQUARE_ENVIRONMENT ?? null,
          });
        },
      });
      try {
        await writeStoredSnapshot(snapshot);
      } catch (error) {
        console.error("Snapshot write failed", error);
      }
      return snapshot;
    });

    if (locked.skipped) return { skipped: true };
    return { skipped: false, snapshot: locked.result };
  } catch (error) {
    console.error("Snapshot store unavailable", error);
    const snapshot = await loadFreshSnapshot(now, null);
    return { skipped: false, snapshot };
  }
}

export async function loadSetupConfig(): Promise<PosCardConfig[]> {
  if (process.env.DASHBOARD_DATABASE_URL) {
    try {
      const stored = await readPosConfig();
      if (stored) return stored.cards;
    } catch (error) {
      console.error("POS config read failed", error);
    }
  }
  return loadPosConfig().cards;
}
