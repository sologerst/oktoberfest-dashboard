import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dayBarPercent, SalesDashboard } from "@/components/sales-dashboard";
import type { DisplayCard, MoneyCard, PublicSnapshot, TicketBoard } from "@/lib/types";

function money(id: string, label: string, cents: number | null, quantity: number | null, status: MoneyCard["status"] = "ok"): DisplayCard {
  return { id, label, cents, quantity, asOf: "2026-10-02T19:14:00.000Z", status, error: null };
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
      money("merch", "Merch", 110500, null),
      money("food", "Food", 0, 0),
    ],
    ...overrides,
  };
}

function html(value: PublicSnapshot, sample = false): string {
  return renderToStaticMarkup(<SalesDashboard initial={value} sample={sample} />);
}

describe("sales screen", () => {
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
    expect(markup).toContain("Weekend passes");
    expect(markup).toContain("Day not recorded");
    expect(markup).toContain("612 items");
    expect(markup).toContain("No sales yet.");
    expect(markup).not.toContain("48 items");
    expect(markup).toContain("Refreshes every 60s");
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
        }),
      }),
    );
    expect(markup).toContain("Unavailable");
    expect(markup).toContain("No sales yet.");
    expect(markup).not.toContain("config/pos-categories.yaml");
    expect(markup).not.toContain("$0.00</p><p class=\"mt-1 text-xs text-white/45\">Unavailable");
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
    expect(markup).not.toContain("Refreshes every 60s");
  });
});
