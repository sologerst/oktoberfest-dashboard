import { describe, expect, it } from "vitest";
import { assertDashboardIsSeparate, databaseIdentity } from "@/lib/db";

describe("database targets", () => {
  it("identifies a database without its password", () => {
    expect(databaseIdentity("postgres://reader:secret@db.example:5432/festival")).toBe(
      "db.example:5432/festival",
    );
  });

  it("refuses to use the festival database as the snapshot store", () => {
    const previousFestival = process.env.FESTIVAL_DATABASE_URL;
    const previousDashboard = process.env.DASHBOARD_DATABASE_URL;
    process.env.FESTIVAL_DATABASE_URL = "postgres://reader:a@db.example:5432/festival";
    process.env.DASHBOARD_DATABASE_URL = "postgres://writer:b@db.example:5432/festival";
    try {
      expect(() => assertDashboardIsSeparate()).toThrow(/different database/);
    } finally {
      if (previousFestival === undefined) delete process.env.FESTIVAL_DATABASE_URL;
      else process.env.FESTIVAL_DATABASE_URL = previousFestival;
      if (previousDashboard === undefined) delete process.env.DASHBOARD_DATABASE_URL;
      else process.env.DASHBOARD_DATABASE_URL = previousDashboard;
    }
  });
});
