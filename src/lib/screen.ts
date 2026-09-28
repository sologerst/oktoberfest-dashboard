import { isProductionEnv } from "@/lib/auth";
import { readStoredSnapshot } from "@/lib/db";
import { cardReadiness, invalidCardMessage, loadPosConfig, posFingerprint, type PosConfig } from "@/lib/pos-config";
import { emptyMoneyCard, emptyTicketBoard } from "@/lib/refresh";
import { loadSetupConfig, runRefresh } from "@/lib/run-refresh";
import { sampleSnapshot } from "@/lib/sample-snapshot";
import { chicagoDate, snapshotNeedsRefresh } from "@/lib/time";
import { remainingTicketedDates } from "@/lib/tickets";
import type { DisplayCard, PublicSnapshot, StoredSnapshot } from "@/lib/types";

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Could not read the snapshot";
}

function cardsFromConfig(config: PosConfig | null): DisplayCard[] {
  if (!config) {
    return [{ id: "pos", label: "On-site sales", ...emptyMoneyCard("error", "POS config could not be read.") }];
  }
  const readiness = cardReadiness(config);
  return config.cards.map((card) => {
    if (card.rollsUp.length > 0) {
      return { id: card.id, label: card.label, ...emptyMoneyCard("error", "Waiting for the first Square pull.") };
    }
    if (readiness[card.id] === "unconfigured") {
      return { id: card.id, label: card.label, ...emptyMoneyCard("unconfigured") };
    }
    if (readiness[card.id] === "invalid") {
      return { id: card.id, label: card.label, ...emptyMoneyCard("error", invalidCardMessage(config, card.id)) };
    }
    return { id: card.id, label: card.label, ...emptyMoneyCard("error", "Waiting for the first Square pull.") };
  });
}

export function waitingSnapshot(now: Date, ticketError: string, config: PosConfig | null): PublicSnapshot {
  return {
    generatedAt: now.toISOString(),
    tickets: {
      ...emptyTicketBoard("error", ticketError, []),
      days: remainingTicketedDates(chicagoDate(now)).map((day) => ({ ...day, count: null })),
    },
    cards: cardsFromConfig(config),
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
    config = { cards: await loadSetupConfig() };
  } catch (error) {
    console.error("POS config read failed", messageOf(error));
    try {
      config = loadPosConfig();
    } catch (yamlError) {
      console.error("POS config file read failed", messageOf(yamlError));
    }
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
    const configChanged = config !== null && stored?.public.configFingerprint !== posFingerprint(config);
    if (snapshotNeedsRefresh(stored?.public.generatedAt, now) || configChanged) {
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
