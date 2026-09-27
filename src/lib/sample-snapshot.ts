import { chicagoDate } from "@/lib/time";
import { remainingTicketedDates } from "@/lib/tickets";
import type { MoneyCard, PublicSnapshot } from "@/lib/types";

function card(cents: number, quantity: number, asOf: string): MoneyCard {
  return { cents, quantity, asOf, status: "ok", error: null };
}

/** Dev-only stand-in so the screen layout can be reviewed before credentials exist. */
export function sampleSnapshot(now: Date): PublicSnapshot {
  const asOf = now.toISOString();
  const day = chicagoDate(now);
  return {
    generatedAt: asOf,
    tickets: {
      salesTodayCount: 24,
      salesTodayCents: 31800,
      scannedToday: day >= "2026-10-02" ? 86 : 0,
      days: remainingTicketedDates(day).map((entry, index) => ({
        ...entry,
        count: [180, 240, 96][index] ?? 0,
      })),
      weekendPasses: 40,
      dayNotRecorded: 15,
      asOf,
      status: "ok",
      error: null,
    },
    beer: card(422050, 612, asOf),
    merch: card(110500, 48, asOf),
    food: card(301075, 290, asOf),
  };
}
