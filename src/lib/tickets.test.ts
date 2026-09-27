import { describe, expect, it } from "vitest";
import {
  loadTicketNumbers,
  remainingTicketedDates,
  salesTodayQuery,
  scannedTodayQuery,
  shapeSoldLines,
  type SoldRow,
} from "@/lib/tickets";

describe("ticket aggregates", () => {
  it("keeps Friday through Sunday on or after today", () => {
    expect(remainingTicketedDates("2026-09-27").map((day) => day.date)).toEqual([
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(remainingTicketedDates("2026-10-03").map((day) => day.date)).toEqual(["2026-10-03", "2026-10-04"]);
    expect(remainingTicketedDates("2026-10-05")).toEqual([]);
  });

  it("separates dated tickets, weekend passes, and undated single-day tickets", () => {
    const rows: SoldRow[] = [
      { valid_date: "2026-10-02", slug: "ga", count: 2 },
      { valid_date: "2026-10-02", slug: "vip", count: 1 },
      { valid_date: "2026-10-03", slug: "ga", count: 4 },
      { valid_date: null, slug: "ga-weekend", count: 5 },
      { valid_date: null, slug: "weekend", count: 1 },
      { valid_date: null, slug: "ga", count: 7 },
      { valid_date: null, slug: "vip", count: 2 },
      { valid_date: null, slug: "other", count: 9 },
    ];
    const shaped = shapeSoldLines(rows, remainingTicketedDates("2026-10-02"));
    expect(shaped.days.map((day) => [day.date, day.count])).toEqual([
      ["2026-10-02", 3],
      ["2026-10-03", 4],
      ["2026-10-04", 0],
    ]);
    expect(shaped.weekendPasses).toBe(6);
    expect(shaped.dayNotRecorded).toBe(9);
  });

  it("counts paid non-revoked tickets and drops comps from dollars only", () => {
    const sales = salesTodayQuery("2026-10-02");
    expect(sales.values).toEqual(["2026-10-02"]);
    expect(sales.text).toContain("o.status = 'paid'");
    expect(sales.text).toContain('t."revokedAt" IS NULL');
    expect(sales.text).toContain("COMP:%");
    expect(sales.text).toContain('o."paymentProvider" IS NULL');
    expect(sales.text).toContain("America/Chicago");
    expect(sales.text).not.toContain("totalInCents");

    const scanned = scannedTodayQuery("2026-10-03");
    expect(scanned.text).toContain('ticket_check_ins');
    expect(scanned.text).toContain('"eventDate"');
    expect(scanned.values).toEqual(["2026-10-03"]);
  });

  it("loads the three aggregates", async () => {
    const calls: string[] = [];
    const numbers = await loadTicketNumbers(
      {
        async query<T>(text: string) {
          calls.push(text);
          if (text.includes("ticket_check_ins")) return { rows: [{ count: 4 }] as T[] };
          if (text.includes("valid_date")) {
            return {
              rows: [{ valid_date: "2026-10-04", slug: "ga", count: 2 }] as T[],
            };
          }
          return { rows: [{ count: 3, cents: 3000 }] as T[] };
        },
      },
      "2026-10-04",
    );
    expect(calls).toHaveLength(3);
    expect(numbers.salesTodayCount).toBe(3);
    expect(numbers.salesTodayCents).toBe(3000);
    expect(numbers.scannedToday).toBe(4);
    expect(numbers.days).toEqual([{ date: "2026-10-04", label: "Sunday, Oct 4", count: 2 }]);
    expect(numbers.weekendPasses).toBe(0);
    expect(numbers.dayNotRecorded).toBe(0);
  });
});
