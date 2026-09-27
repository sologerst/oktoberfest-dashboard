import { getFestivalPool, withDashboardLock, readStoredSnapshot, writeStoredSnapshot } from "@/lib/db";
import { loadPosConfig, type PosConfig } from "@/lib/pos-config";
import { buildSnapshot } from "@/lib/refresh";
import { pullPos } from "@/lib/square";
import { chicagoDate } from "@/lib/time";
import { loadTicketNumbers } from "@/lib/tickets";
import type { StoredSnapshot } from "@/lib/types";

const unreadConfig: PosConfig = {
  beer: { locationIds: ["unreadable"], catalogObjectIds: [], categoryIds: [] },
  merch: { locationIds: ["unreadable"], catalogObjectIds: [], categoryIds: [] },
  food: { locationIds: ["unreadable"], catalogObjectIds: [], categoryIds: [] },
};

export async function runRefresh(now = new Date()): Promise<{ skipped: true } | { skipped: false; snapshot: StoredSnapshot }> {
  const locked = await withDashboardLock(async () => {
    const previous = await readStoredSnapshot();
    let config = unreadConfig;
    let configError: Error | null = null;
    try {
      config = loadPosConfig();
    } catch (error) {
      configError = error instanceof Error ? error : new Error("POS config could not be read");
    }

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
    await writeStoredSnapshot(snapshot);
    return snapshot;
  });

  if (locked.skipped) return { skipped: true };
  return { skipped: false, snapshot: locked.result };
}
