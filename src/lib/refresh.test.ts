import { describe, expect, it } from "vitest";
import type { PosConfig } from "@/lib/pos-config";
import { buildSnapshot, emptyMoneyCard } from "@/lib/refresh";
import type { CardAttempt } from "@/lib/square";
import type { CardId, StoredSnapshot, TicketNumbers } from "@/lib/types";

const numbers: TicketNumbers = {
  salesTodayCount: 4,
  salesTodayCents: 4000,
  scannedToday: 2,
  days: [{ date: "2026-10-03", label: "Saturday, Oct 3", count: 4 }],
  weekendPasses: 1,
  dayNotRecorded: 3,
};

const ready: PosConfig = {
  beer: { locationIds: ["L"], catalogObjectIds: ["B"], categoryIds: [] },
  merch: { locationIds: ["L"], catalogObjectIds: ["M"], categoryIds: [] },
  food: { locationIds: [], catalogObjectIds: [], categoryIds: [] },
};

function okCard(cents: number): CardAttempt {
  return { status: "ok", cents, quantity: 1, error: null };
}

function previous(asOf: string, beerCents = 1000): StoredSnapshot {
  return {
    squareState: { chicagoDay: "2026-10-03", updatedSince: asOf, orders: {} },
    public: {
      generatedAt: asOf,
      tickets: { ...numbers, asOf, status: "ok", error: null },
      beer: { cents: beerCents, quantity: 8, asOf, status: "ok", error: null },
      merch: { cents: 500, quantity: 2, asOf, status: "ok", error: null },
      food: emptyMoneyCard("unconfigured"),
    },
  };
}

describe("snapshot refresh", () => {
  it("keeps same-day Square totals when Square fails and still updates tickets", async () => {
    const snapshot = await buildSnapshot({
      now: new Date("2026-10-03T22:00:00.000Z"),
      previous: previous("2026-10-03T21:00:00.000Z"),
      config: ready,
      loadTickets: async () => ({ ...numbers, salesTodayCount: 9 }),
      loadSquare: async () => {
        throw new Error("Square timeout");
      },
    });
    expect(snapshot.public.tickets.status).toBe("ok");
    expect(snapshot.public.tickets.salesTodayCount).toBe(9);
    expect(snapshot.public.beer).toMatchObject({ status: "stale", cents: 1000, error: "Square timeout" });
    expect(snapshot.public.merch.status).toBe("stale");
    expect(snapshot.public.food.status).toBe("unconfigured");
    expect(snapshot.squareState?.updatedSince).toBe("2026-10-03T21:00:00.000Z");
  });

  it("keeps same-day ticket totals when the database fails and still updates Square", async () => {
    const cards: Record<CardId, CardAttempt> = {
      beer: okCard(2500),
      merch: okCard(800),
      food: { status: "unconfigured", cents: null, quantity: null, error: null },
    };
    const snapshot = await buildSnapshot({
      now: new Date("2026-10-03T22:00:00.000Z"),
      previous: previous("2026-10-03T21:00:00.000Z", 1000),
      config: ready,
      loadTickets: async () => {
        throw new Error("database unavailable");
      },
      loadSquare: async () => ({ cards, state: { chicagoDay: "2026-10-03", updatedSince: "2026-10-03T22:00:00.000Z", orders: {} } }),
    });
    expect(snapshot.public.tickets).toMatchObject({
      status: "stale",
      salesTodayCount: 4,
      error: "database unavailable",
    });
    expect(snapshot.public.beer).toMatchObject({ status: "ok", cents: 2500 });
    expect(snapshot.public.food.status).toBe("unconfigured");
  });

  it("does not present yesterday's totals as today", async () => {
    const snapshot = await buildSnapshot({
      now: new Date("2026-10-04T15:00:00.000Z"),
      previous: previous("2026-10-03T21:00:00.000Z"),
      config: ready,
      loadTickets: async () => {
        throw new Error("database unavailable");
      },
      loadSquare: async () => {
        throw new Error("Square timeout");
      },
    });
    expect(snapshot.public.tickets.status).toBe("error");
    expect(snapshot.public.tickets.salesTodayCount).toBeNull();
    expect(snapshot.public.tickets.days).toEqual([
      { date: "2026-10-04", label: "Sunday, Oct 4", count: null },
    ]);
    expect(snapshot.public.tickets.weekendPasses).toBeNull();
    expect(snapshot.public.beer.status).toBe("error");
    expect(snapshot.public.beer.cents).toBeNull();
  });
});
