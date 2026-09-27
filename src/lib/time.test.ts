import { describe, expect, it } from "vitest";
import {
  chicagoDate,
  chicagoDayBounds,
  formatChicagoTime,
  formatFestivalDay,
  sameChicagoDay,
  snapshotNeedsRefresh,
} from "@/lib/time";

describe("Chicago time", () => {
  it("uses CDT in October", () => {
    expect(chicagoDate(new Date("2026-10-02T04:59:00.000Z"))).toBe("2026-10-01");
    expect(chicagoDate(new Date("2026-10-02T05:00:00.000Z"))).toBe("2026-10-02");
    expect(chicagoDayBounds("2026-10-02")).toEqual({
      start: "2026-10-02T05:00:00.000Z",
      end: "2026-10-03T05:00:00.000Z",
    });
  });

  it("uses CST in January", () => {
    expect(chicagoDate(new Date("2026-01-15T05:59:00.000Z"))).toBe("2026-01-14");
    expect(chicagoDate(new Date("2026-01-15T06:00:00.000Z"))).toBe("2026-01-15");
    expect(chicagoDayBounds("2026-01-15")).toEqual({
      start: "2026-01-15T06:00:00.000Z",
      end: "2026-01-16T06:00:00.000Z",
    });
  });

  it("refreshes a missing or minute-old snapshot", () => {
    const now = new Date("2026-10-03T18:00:00.000Z");
    expect(snapshotNeedsRefresh(null, now)).toBe(true);
    expect(snapshotNeedsRefresh("2026-10-03T17:59:00.000Z", now)).toBe(true);
    expect(snapshotNeedsRefresh("2026-10-03T17:59:30.000Z", now)).toBe(false);
  });

  it("formats clock time with a CT suffix and a short festival day", () => {
    expect(formatChicagoTime("2026-10-02T19:14:00.000Z")).toBe("2:14 PM CT");
    expect(formatFestivalDay("2026-10-02T19:14:00.000Z")).toBe("Friday, Oct 2");
  });

  it("matches a timestamp to its Chicago day", () => {
    expect(sameChicagoDay("2026-10-02T05:30:00.000Z", "2026-10-02")).toBe(true);
    expect(sameChicagoDay("2026-10-02T04:30:00.000Z", "2026-10-02")).toBe(false);
    expect(sameChicagoDay(null, "2026-10-02")).toBe(false);
  });
});
