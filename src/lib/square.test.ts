import { describe, expect, it } from "vitest";
import { chicagoDayBounds } from "@/lib/time";
import type { PosCardConfig, PosConfig } from "@/lib/pos-config";
import {
  foldOrders,
  locationMembership,
  pullPos,
  totalsFromState,
  type CardAttempt,
  type CardForCatalog,
} from "@/lib/square";
import type { CardId, SquareState } from "@/lib/types";

const bounds = chicagoDayBounds("2026-10-03");

function blank(id: string, label: string): PosCardConfig {
  return {
    id,
    label,
    locationIds: [],
    catalogObjectIds: [],
    categoryIds: [],
    countItemIds: [],
    countLabel: "",
    rollsUp: [],
  };
}

function config(overrides: Partial<Record<string, Partial<PosCardConfig>>> = {}): PosConfig {
  return {
    cards: (["beer", "merch", "food"] as const).map((id) => ({
      ...blank(id, id[0]!.toUpperCase() + id.slice(1)),
      ...overrides[id],
    })),
  };
}

function totals(state: SquareState, failed = new Set<CardId>(), counting = new Set<CardId>(["beer", "merch", "food"])) {
  return totalsFromState(state, ["beer", "merch", "food"], failed, counting);
}

function byCatalog(entries: [string, CardId][]): CardForCatalog {
  const map = new Map(entries);
  return (_locationId, catalogId) => map.get(catalogId) ?? null;
}

function counts(card: CardId, ids: string[]): Map<CardId, Set<string>> {
  return new Map([[card, new Set(ids)]]);
}

describe("Square card totals", () => {
  it("fails both cards when one catalog item is listed twice at the same location", () => {
    const { cardFor, failed } = locationMembership(
      config({
        beer: { locationIds: ["L1"], catalogObjectIds: ["shared", "beer-only"] },
        merch: { locationIds: ["L1"], catalogObjectIds: ["shared"] },
      }),
      { beer: [], merch: [], food: [] },
    );
    expect([...failed].sort()).toEqual(["beer", "merch"]);
    expect(cardFor("L1", "beer-only")).toBeNull();
    expect(cardFor("L1", "shared")).toBeNull();
  });

  it("counts a shared item only at the location on that card", () => {
    const { cardFor, failed } = locationMembership(
      config({
        beer: { locationIds: ["L-PROVERBS"], catalogObjectIds: ["lager"] },
        merch: { locationIds: ["L-PIUS"], catalogObjectIds: ["lager"] },
      }),
      { beer: [], merch: [], food: [] },
    );
    expect(failed.size).toBe(0);
    expect(cardFor("L-PROVERBS", "lager")).toBe("beer");
    expect(cardFor("L-PIUS", "lager")).toBe("merch");
    expect(cardFor("L-OTHER", "lager")).toBeNull();
    expect(cardFor(undefined, "lager")).toBeNull();
  });

  it("replaces an updated order instead of adding it twice, and drops yesterday on a new day", () => {
    const cardFor = byCatalog([["beer-1", "beer"]]);
    const order = {
      id: "order-1",
      location_id: "L1",
      state: "COMPLETED",
      closed_at: "2026-10-03T18:00:00.000Z",
      updated_at: "2026-10-03T18:00:00.000Z",
      line_items: [{ catalog_object_id: "beer-1", quantity: "2", total_money: { amount: 1400 } }],
    };
    const countIdsByCard = counts("beer", ["beer-1"]);
    const first = foldOrders({ previous: null, incoming: [order], day: "2026-10-03", bounds, cardFor, countIdsByCard });
    const second = foldOrders({
      previous: first,
      incoming: [{ ...order, updated_at: "2026-10-03T19:00:00.000Z", line_items: [{ catalog_object_id: "beer-1", quantity: "1", total_money: { amount: 700 } }] }],
      day: "2026-10-03",
      bounds,
      cardFor,
      countIdsByCard,
    });
    expect(totals(second).beer).toEqual({ cents: 700, quantity: 1 });
    expect(second.updatedSince).toBe("2026-10-03T19:00:00.000Z");

    const nextDay = foldOrders({
      previous: second,
      incoming: [],
      day: "2026-10-04",
      bounds: chicagoDayBounds("2026-10-04"),
      cardFor,
      countIdsByCard,
    });
    expect(nextDay.orders).toEqual({});
  });

  it("ignores lines with no catalog item and hides quantity when a line omits it", () => {
    const state = foldOrders({
      previous: null,
      incoming: [
        {
          id: "order-2",
          location_id: "L1",
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
      cardFor: byCatalog([["food-1", "food"]]),
      countIdsByCard: counts("food", ["food-1"]),
    });
    expect(totals(state, new Set(), new Set(["food"])).food).toEqual({ cents: 750, quantity: null });
  });

  it("counts only the programmed items and still sums every item's dollars", () => {
    const state = foldOrders({
      previous: null,
      incoming: [
        {
          id: "order-3",
          location_id: "L1",
          state: "COMPLETED",
          closed_at: "2026-10-03T20:00:00Z",
          updated_at: "2026-10-03T20:00:00Z",
          line_items: [
            { catalog_object_id: "beer-1", quantity: "2", total_money: { amount: 1000 } },
            { catalog_object_id: "beer-2", total_money: { amount: 500 } },
          ],
        },
      ],
      day: "2026-10-03",
      bounds,
      cardFor: byCatalog([
        ["beer-1", "beer"],
        ["beer-2", "beer"],
      ]),
      countIdsByCard: counts("beer", ["beer-1"]),
    });
    expect(totals(state, new Set(), new Set(["beer"])).beer).toEqual({ cents: 1500, quantity: 2 });
    expect(totals(state, new Set(), new Set()).beer).toEqual({ cents: 1500, quantity: null });
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
              location_id: "LOC",
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

    const pos = config({
      beer: { locationIds: ["LOC"], catalogObjectIds: ["beer-1"], countItemIds: ["beer-1"], countLabel: "beers" },
    });
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

  it("counts a shared category only for the location on each card", async () => {
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).includes("catalog")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "item-1", item_data: { variations: [{ id: "var-1" }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          orders: [
            {
              id: "proverbs-order",
              location_id: "L-PROVERBS",
              state: "COMPLETED",
              closed_at: "2026-10-03T18:00:00.000Z",
              updated_at: "2026-10-03T18:00:00.000Z",
              line_items: [{ catalog_object_id: "var-1", quantity: "2", total_money: { amount: 1000 } }],
            },
            {
              id: "pius-order",
              location_id: "L-PIUS",
              state: "COMPLETED",
              closed_at: "2026-10-03T18:05:00.000Z",
              updated_at: "2026-10-03T18:05:00.000Z",
              line_items: [{ catalog_object_id: "var-1", quantity: "1", total_money: { amount: 400 } }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const pos: PosConfig = {
      cards: [
        { ...blank("proverbs", "Proverbs"), locationIds: ["L-PROVERBS"], categoryIds: ["CAT"], countItemIds: ["var-1"], countLabel: "beers" },
        { ...blank("pius", "St. Pius"), locationIds: ["L-PIUS"], categoryIds: ["CAT"], countItemIds: ["var-1"], countLabel: "beers" },
        { ...blank("food", "Food") },
      ],
    };
    const pulled = await pullPos({
      config: pos,
      state: null,
      now: new Date("2026-10-03T20:00:00.000Z"),
      token: "token",
      environment: "production",
      fetchImpl,
    });
    expect(pulled.cards.proverbs).toMatchObject({ status: "ok", cents: 1000, quantity: 2 });
    expect(pulled.cards.pius).toMatchObject({ status: "ok", cents: 400, quantity: 1 });
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
