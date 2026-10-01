import { chicagoDate } from "@/lib/time";
import { remainingTicketedDates } from "@/lib/tickets";
import type { DisplayCard, PublicSnapshot } from "@/lib/types";

function card(id: string, label: string, cents: number, quantity: number, asOf: string, quantityLabel: string | null = null): DisplayCard {
  return { id, label, cents, quantity, quantityLabel, asOf, status: "ok", error: null };
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
        count: [120, 180, 240, 96][index] ?? 0,
      })),
      weekendPasses: 40,
      dayNotRecorded: 15,
      asOf,
      status: "ok",
      error: null,
    },
    cards: [
      card("beer", "Beer", 842050, 1204, asOf, "beers"),
      card("proverbs", "Proverbs", 180000, 260, asOf, "beers"),
      card("st-pius", "St. Pius", 152000, 214, asOf, "beers"),
      card("bikers", "Bikers", 121000, 176, asOf, "beers"),
      card("songwriters", "Songwriters", 98000, 142, asOf, "beers"),
      card("emerald", "Emerald", 91050, 128, asOf, "beers"),
      card("merch", "Merch", 110500, 48, asOf),
      card("food", "Food", 301075, 290, asOf),
    ],
  };
}
