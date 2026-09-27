import { describe, expect, it } from "vitest";
import { chicagoDayBounds } from "@/lib/time";
import type { PosCardConfig, PosConfig } from "@/lib/pos-config";
import {
  expandedMembership,
  foldOrders,
  pullPos,
  totalsFromState,
  type CardAttempt,
} from "@/lib/square";
import type { CardId, SquareState } from "@/lib/types";

const bounds = chicagoDayBounds("2026-10-03");

function blank(id: string, label: string): PosCardConfig {
  return { id, label, locationIds: [], catalogObjectIds: [], categoryIds: [], rollsUp: [] };
}

function config(overrides: Partial<Record<string, Partial<PosCardConfig>>> = {}): PosConfig {
  return {
    cards: (["beer", "merch", "food"] as const).map((id) => ({
      ...blank(id, id[0]!.toUpperCase() + id.slice(1)),
      ...overrides[id],
    })),
  };
}

function totals(state: SquareState, failed = new Set<CardId>()) {
  return totalsFromState(state, ["beer", "merch", "food"], failed);
}

describe("Square card totals", () => {
  it("fails both cards when one catalog item is listed twice", () => {
    const { membership, failed } = expandedMembership(
      config({
        beer: { locationIds: ["L1"], catalogObjectIds: ["shared", "beer-only"] },
        merch: { locationIds: ["L1"], catalogObjectIds: ["shared"] },
      }),
      { beer: [], merch: [], food: [] },
    );
    expect([...failed].sort()).toEqual(["beer", "merch"]);
    expect(membership.get("beer-only")).toBe("beer");
    expect(membership.has("shared")).toBe(false);
  });

  it("replaces an updated order instead of adding it twice, and drops yesterday on a new day", () => {
    const membership = new Map<string, CardId>([["beer-1", "beer"]]);
    const order = {
      id: "order-1",
      state: "COMPLETED",
      closed_at: "2026-10-03T18:00:00.000Z",
      updated_at: "2026-10-03T18:00:00.000Z",
      line_items: [{ catalog_object_id: "beer-1", quantity: "2", total_money: { amount: 1400 } }],
    };
    const first = foldOrders({ previous: null, incoming: [order], day: "2026-10-03", bounds, membership });
    const second = foldOrders({
      previous: first,
      incoming: [{ ...order, updated_at: "2026-10-03T19:00:00.000Z", line_items: [{ catalog_object_id: "beer-1", quantity: "1", total_money: { amount: 700 } }] }],
      day: "2026-10-03",
      bounds,
      membership,
    });
    expect(totals(second).beer).toEqual({ cents: 700, quantity: 1 });
    expect(second.updatedSince).toBe("2026-10-03T19:00:00.000Z");

    const nextDay = foldOrders({
      previous: second,
      incoming: [],
      day: "2026-10-04",
      bounds: chicagoDayBounds("2026-10-04"),
      membership,
    });
    expect(nextDay.orders).toEqual({});
  });

  it("ignores lines with no catalog item and hides quantity when a line omits it", () => {
    const membership = new Map<string, CardId>([["food-1", "food"]]);
    const state = foldOrders({
      previous: null,
      incoming: [
        {
          id: "order-2",
          state: "COMPLETED",
          closed_at: "2026-10-03T20:00:00Z",
          updated_at: "2026-10-03T20:00:00Z",
          line_items: [
            { catalog_object_id: "food-1", quantity: "1", total_money: { amount: 500 } },
            { catalog_object_id: "food-1", total_money: { amount: 250 } },
            { quantity: "4", total_money: { amount: 999 } },
          ],
        },
      ],
      day: "2026-10-03",
      bounds,
      membership,
    });
    expect(totals(state).food).toEqual({ cents: 750, quantity: null });
  });

  it("searches closed orders for the day, then updates since the cursor", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const incremental = bodies.length > 1;
      return new Response(
        JSON.stringify({
          orders: [
            {
              id: "order-9",
              state: "COMPLETED",
              closed_at: "2026-10-03T18:00:00.000Z",
              updated_at: incremental ? "2026-10-03T19:00:00.000Z" : "2026-10-03T18:00:00.000Z",
              line_items: [
                {
                  catalog_object_id: "beer-1",
                  quantity: "1",
                  total_money: { amount: incremental ? 900 : 500 },
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const pos = config({ beer: { locationIds: ["LOC"], catalogObjectIds: ["beer-1"] } });
    const now = new Date("2026-10-03T20:00:00.000Z");
    const first = await pullPos({
      config: pos,
      state: null,
      now,
      token: "token",
      environment: "production",
      fetchImpl,
    });
    expect(first.cards.beer).toMatchObject({ status: "ok", cents: 500, quantity: 1 });
    expect(JSON.stringify(bodies[0])).toContain("CLOSED_AT");

    const second = await pullPos({
      config: pos,
      state: first.state,
      now,
      token: "token",
      environment: "production",
      fetchImpl,
    });
    expect(second.cards.beer).toMatchObject({ status: "ok", cents: 900, quantity: 1 });
    expect(JSON.stringify(bodies[1])).toContain("UPDATED_AT");
    expect(second.cards.merch.status).toBe("unconfigured");
  });

  it("does not call Square when no card is configured", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("nope", { status: 500 });
    };
    const pulled = await pullPos({
      config: config(),
      state: null,
      now: new Date("2026-10-03T20:00:00.000Z"),
      token: null,
      environment: null,
      fetchImpl,
    });
    expect(called).toBe(false);
    expect(Object.values(pulled.cards).map((card: CardAttempt) => card.status)).toEqual([
      "unconfigured",
      "unconfigured",
      "unconfigured",
    ]);
  });
});
