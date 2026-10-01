import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { boothColumnClass, dayBarPercent, dayColumnClass, groupOnSite, posColumnClass, SalesDashboard } from "@/components/sales-dashboard";
import type { DisplayCard, MoneyCard, PublicSnapshot, TicketBoard } from "@/lib/types";

function money(
  id: string,
  label: string,
  cents: number | null,
  quantity: number | null,
  status: MoneyCard["status"] = "ok",
  quantityLabel: string | null = null,
  place?: DisplayCard["place"],
): DisplayCard {
  return { id, label, cents, quantity, quantityLabel, place, asOf: "2026-10-02T19:14:00.000Z", status, error: null };
}

function tickets(overrides: Partial<TicketBoard> = {}): TicketBoard {
  return {
    salesTodayCount: 24,
    salesTodayCents: 31800,
    scannedToday: 86,
    days: [
      { date: "2026-10-02", label: "Friday, Oct 2", count: 180 },
      { date: "2026-10-03", label: "Saturday, Oct 3", count: 240 },
      { date: "2026-10-04", label: "Sunday, Oct 4", count: 0 },
    ],
    weekendPasses: 40,
    dayNotRecorded: 15,
    asOf: "2026-10-02T19:14:00.000Z",
    status: "ok",
    error: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<PublicSnapshot> = {}): PublicSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    tickets: tickets(),
    cards: [
      money("beer", "Beer", 422050, 612),
      money("merch", "Merch", 110500, 48, "ok", "beers"),
      money("food", "Food", 0, 0),
    ],
    ...overrides,
  };
}

function html(value: PublicSnapshot, sample = false): string {
  return renderToStaticMarkup(<SalesDashboard initial={value} sample={sample} />);
}

describe("sales screen", () => {
  it("puts the beer total beside its booths and merch and food in a short row", () => {
    expect(dayColumnClass(4)).toContain("xl:grid-cols-4");
    expect(dayColumnClass(3)).toContain("xl:grid-cols-3");
    expect(posColumnClass(8)).toContain("lg:grid-cols-4");
    expect(boothColumnClass(4)).toContain("sm:grid-cols-2");
    const cards = [
      money("beer", "Beer", 716400, 516, "ok", "beers", "total"),
      money("proverbs", "Proverbs", 156000, 114, "ok", "beers", "booth"),
      money("st-pius", "St. Pius", 229000, 164, "ok", "beers", "booth"),
      money("bikers", "Bikers", 182200, 131, "ok", "beers", "booth"),
      money("emerald", "Emerald", 149200, 107, "ok", "beers", "booth"),
      money("merch", "Merch", 45500, 18, "ok", null, "other"),
      money("food", "Food", 51700, 22, "ok", null, "other"),
    ];
    expect(groupOnSite(cards)?.total.label).toBe("Beer");
    expect(groupOnSite(cards)?.booths.map((card) => card.label)).toEqual(["Proverbs", "St. Pius", "Bikers", "Emerald"]);
    expect(groupOnSite(cards)?.other.map((card) => card.label)).toEqual(["Merch", "Food"]);
    const markup = html(
      snapshot({
        tickets: tickets({
          days: [
            { date: "2026-10-01", label: "Thursday, Oct 1", count: 3299 },
            { date: "2026-10-02", label: "Friday, Oct 2", count: 3234 },
            { date: "2026-10-03", label: "Saturday, Oct 3", count: 1214 },
            { date: "2026-10-04", label: "Sunday, Oct 4", count: 389 },
          ],
        }),
        cards,
      }),
    );
    expect(markup).toContain("xl:grid-cols-4");
    expect(markup).toContain("sales-tile-hero");
    expect(markup).toContain("sales-tile-compact");
    expect(markup).toContain("xl:grid-cols-[minmax(16rem,0.95fr)_minmax(0,1.25fr)]");
    expect(markup).not.toContain("lg:grid-cols-4");
    expect(markup).toContain("Proverbs");
    expect(markup).toContain("Sunday, Oct 4");
    expect(groupOnSite([money("beer", "Beer", 1, 1), money("merch", "Merch", 1, 1)])).toBeNull();
  });

  it("sizes day bars against the busiest remaining day", () => {
    expect(dayBarPercent(240, 240)).toBe(100);
    expect(dayBarPercent(180, 240)).toBe(75);
    expect(dayBarPercent(0, 240)).toBe(0);
    expect(dayBarPercent(null, 240)).toBe(0);
  });

  it("matches the admin card labels, money, and day rows", () => {
    const markup = html(snapshot());
    expect(markup).toContain("Nashville Oktoberfest 2026");
    expect(markup).toContain("Tickets sold today");
    expect(markup).toContain("Ticket sales today");
    expect(markup).toContain("Scanned today");
    expect(markup).toContain("$318.00");
    expect(markup).toContain("text-mark");
    expect(markup).toContain("Unique tickets for Friday, Oct 2");
    expect(markup).toContain("Saturday, Oct 3");
    expect(markup).toContain("style=\"width:100%\"");
    expect(markup).toContain("style=\"width:75%\"");
    expect(markup).toContain("style=\"width:0%\"");
    expect(markup).toContain("Sold for remaining days");
    expect(markup).toContain("Refreshes every 30s");
    expect(markup).toContain("Weekend passes");
    expect(markup).toContain("Day not recorded");
    expect(markup).toContain("612 items");
    expect(markup).toContain("48 beers");
    expect(markup).toContain("No sales yet.");
    expect(markup).not.toContain("48 items");
    expect(markup).toContain("Refreshes every 30s");
  });

  it("hides a zero day-not-recorded row and omits a missing quantity", () => {
    const markup = html(
      snapshot({
        tickets: tickets({ dayNotRecorded: 0 }),
        cards: [
          money("beer", "Beer", 422050, null),
          money("merch", "Merch", 110500, null),
          money("food", "Food", 500, null),
        ],
      }),
    );
    expect(markup).not.toContain("Day not recorded");
    expect(markup).not.toContain(">612 items<");
    expect(markup).not.toContain(">1 item<");
  });

  it("uses a dash for a failed read and zero dollars for an empty register", () => {
    const markup = html(
      snapshot({
        cards: [
          money("beer", "Beer", null, null, "unconfigured"),
          money("merch", "Merch", 110500, 48),
          money("food", "Food", 0, null, "ok"),
        ],
        tickets: tickets({
          salesTodayCount: null,
          salesTodayCents: null,
          scannedToday: null,
          status: "error",
          error: "Festival database at aws-1-us-east-1.pooler.supabase.com: password authentication failed",
        }),
      }),
    );
    expect(markup).toContain("Unavailable");
    expect(markup).toContain("password authentication failed");
    expect(markup).toContain("No sales yet.");
    expect(markup).not.toContain("config/pos-categories.yaml");
    expect(markup).not.toContain("$0.00</p><p class=\"mt-2 min-h-[2.2em] text-[clamp(0.95rem,2.4cqi,1.3rem)] leading-snug text-white/55\">Unavailable");
  });

  it("marks a stale source on its section and an old snapshot in the header", () => {
    const markup = html(
      snapshot({
        generatedAt: "2020-01-01T00:00:00.000Z",
        tickets: tickets({ status: "stale" }),
        cards: [
          money("beer", "Beer", 100, 2, "stale"),
          money("merch", "Merch", 110500, null),
          money("food", "Food", 0, 0),
        ],
      }),
    );
    expect(markup).toContain(">Stale<");
    expect(markup).toContain("· Stale");
    expect(markup).toContain("On-site sales");
    expect(markup).not.toContain("Refreshes every 30s");
  });
});
