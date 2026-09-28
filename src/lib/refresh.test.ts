import { describe, expect, it } from "vitest";
import { posFingerprint, type PosConfig } from "@/lib/pos-config";
import { buildSnapshot, emptyMoneyCard } from "@/lib/refresh";
import type { CardAttempt } from "@/lib/square";
import type { CardId, DisplayCard, StoredSnapshot, TicketNumbers } from "@/lib/types";

const numbers: TicketNumbers = {
  salesTodayCount: 4,
  salesTodayCents: 4000,
  scannedToday: 2,
  days: [{ date: "2026-10-03", label: "Saturday, Oct 3", count: 4 }],
  weekendPasses: 1,
  dayNotRecorded: 3,
};

const ready: PosConfig = {
  cards: [
    { id: "beer", label: "Beer", locationIds: ["L"], catalogObjectIds: ["B"], categoryIds: [], rollsUp: [] },
    { id: "merch", label: "Merch", locationIds: ["L"], catalogObjectIds: ["M"], categoryIds: [], rollsUp: [] },
    { id: "food", label: "Food", locationIds: [], catalogObjectIds: [], categoryIds: [], rollsUp: [] },
    { id: "alcohol", label: "Alcohol", locationIds: [], catalogObjectIds: [], categoryIds: [], rollsUp: ["beer"] },
  ],
};

function okCard(cents: number): CardAttempt {
  return { status: "ok", cents, quantity: 1, error: null };
}

function shown(snapshot: StoredSnapshot, id: string): DisplayCard | undefined {
  return snapshot.public.cards.find((card) => card.id === id);
}

function previous(asOf: string, beerCents = 1000): StoredSnapshot {
  return {
    squareState: { chicagoDay: "2026-10-03", updatedSince: asOf, orders: {} },
    public: {
      generatedAt: asOf,
      tickets: { ...numbers, asOf, status: "ok", error: null },
      cards: [
        { id: "beer", label: "Beer", cents: beerCents, quantity: 8, asOf, status: "ok", error: null },
        { id: "merch", label: "Merch", cents: 500, quantity: 2, asOf, status: "ok", error: null },
        { id: "food", label: "Food", ...emptyMoneyCard("unconfigured") },
        { id: "alcohol", label: "Alcohol", cents: beerCents, quantity: 8, asOf, status: "ok", error: null },
      ],
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
    expect(shown(snapshot, "beer")).toMatchObject({ status: "stale", cents: 1000, error: "Square timeout" });
    expect(shown(snapshot, "merch")?.status).toBe("stale");
    expect(shown(snapshot, "food")?.status).toBe("unconfigured");
    expect(shown(snapshot, "alcohol")).toMatchObject({ status: "stale", cents: 1000 });
    expect(snapshot.public.configFingerprint).toBe(posFingerprint(ready));
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
    expect(shown(snapshot, "beer")).toMatchObject({ status: "ok", cents: 2500 });
    expect(shown(snapshot, "food")?.status).toBe("unconfigured");
    expect(shown(snapshot, "alcohol")).toMatchObject({ status: "ok", cents: 2500 });
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
    expect(shown(snapshot, "beer")?.status).toBe("error");
    expect(shown(snapshot, "beer")?.cents).toBeNull();
    expect(shown(snapshot, "alcohol")?.cents).toBeNull();
  });

  it("adds each alcohol location into one total without adding quantities that are missing", async () => {
    const config: PosConfig = {
      cards: [
        { id: "north", label: "North tent", locationIds: ["L1"], catalogObjectIds: ["a"], categoryIds: [], rollsUp: [] },
        { id: "south", label: "South tent", locationIds: ["L2"], catalogObjectIds: ["b"], categoryIds: [], rollsUp: [] },
        { id: "alcohol", label: "Alcohol", locationIds: [], catalogObjectIds: [], categoryIds: [], rollsUp: ["north", "south"] },
      ],
    };
    const snapshot = await buildSnapshot({
      now: new Date("2026-10-03T22:00:00.000Z"),
      previous: null,
      config,
      loadTickets: async () => numbers,
      loadSquare: async () => ({
        cards: {
          north: { status: "ok", cents: 100, quantity: 2, error: null },
          south: { status: "ok", cents: 50, quantity: null, error: null },
        },
        state: null,
      }),
    });
    expect(shown(snapshot, "alcohol")).toMatchObject({ status: "ok", cents: 150, quantity: null, label: "Alcohol" });
  });
});
