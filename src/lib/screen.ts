import { isProductionEnv } from "@/lib/auth";
import { readStoredSnapshot } from "@/lib/db";
import { cardReadiness, invalidCardMessage, loadPosConfig, type PosConfig } from "@/lib/pos-config";
import { emptyMoneyCard, emptyTicketBoard } from "@/lib/refresh";
import { runRefresh } from "@/lib/run-refresh";
import { sampleSnapshot } from "@/lib/sample-snapshot";
import { chicagoDate, snapshotNeedsRefresh } from "@/lib/time";
import { remainingTicketedDates } from "@/lib/tickets";
import { CARD_IDS, type MoneyCard, type PublicSnapshot, type StoredSnapshot } from "@/lib/types";

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Could not read the snapshot";
}

function cardsFromConfig(config: PosConfig | null): Record<"beer" | "merch" | "food", MoneyCard> {
  if (!config) {
    return {
      beer: emptyMoneyCard("error", "POS config could not be read."),
      merch: emptyMoneyCard("error", "POS config could not be read."),
      food: emptyMoneyCard("error", "POS config could not be read."),
    };
  }
  const readiness = cardReadiness(config);
  const cards = {} as Record<"beer" | "merch" | "food", MoneyCard>;
  for (const card of CARD_IDS) {
    if (readiness[card] === "unconfigured") cards[card] = emptyMoneyCard("unconfigured");
    else if (readiness[card] === "invalid") {
      cards[card] = emptyMoneyCard("error", invalidCardMessage(config, card));
    } else cards[card] = emptyMoneyCard("error", "Waiting for the first Square pull.");
  }
  return cards;
}

export function waitingSnapshot(now: Date, ticketError: string, config: PosConfig | null): PublicSnapshot {
  const cards = cardsFromConfig(config);
  return {
    generatedAt: now.toISOString(),
    tickets: {
      ...emptyTicketBoard("error", ticketError, []),
      days: remainingTicketedDates(chicagoDate(now)).map((day) => ({ ...day, count: null })),
    },
    ...cards,
  };
}

async function refreshIfDue(
  stored: StoredSnapshot | null,
  now: Date,
): Promise<{ stored: StoredSnapshot | null; error: string | null }> {
  try {
    const result = await runRefresh(now);
    if (!result.skipped) return { stored: result.snapshot, error: null };
    return { stored: (await readStoredSnapshot()) ?? stored, error: null };
  } catch (error) {
    const text = messageOf(error);
    console.error("Snapshot refresh failed", text);
    return { stored, error: text };
  }
}

export async function loadScreenSnapshot(now = new Date()): Promise<{ snapshot: PublicSnapshot; sample: boolean }> {
  if (process.env.DASHBOARD_SAMPLE === "1" && !isProductionEnv()) {
    return { snapshot: sampleSnapshot(now), sample: true };
  }

  let config: PosConfig | null = null;
  try {
    config = loadPosConfig();
  } catch (error) {
    console.error("POS config read failed", messageOf(error));
  }

  if (!process.env.DASHBOARD_DATABASE_URL) {
    return {
      snapshot: waitingSnapshot(now, "DASHBOARD_DATABASE_URL is not set.", config),
      sample: false,
    };
  }

  try {
    let stored = await readStoredSnapshot();
    let refreshError: string | null = null;
    if (snapshotNeedsRefresh(stored?.public.generatedAt, now)) {
      const refreshed = await refreshIfDue(stored, now);
      stored = refreshed.stored;
      refreshError = refreshed.error;
    }
    if (!stored) {
      return {
        snapshot: waitingSnapshot(now, refreshError ?? "Waiting for the first refresh.", config),
        sample: false,
      };
    }
    return { snapshot: stored.public, sample: false };
  } catch (error) {
    const text = messageOf(error);
    console.error("Snapshot read failed", text);
    return { snapshot: waitingSnapshot(now, text, config), sample: false };
  }
}
