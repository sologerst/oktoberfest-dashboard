import { describe, expect, it } from "vitest";
import { assertDashboardIsSeparate, databaseIdentity, reachableDashboardUrl } from "@/lib/db";

describe("database targets", () => {
  it("identifies a database without its password", () => {
    expect(databaseIdentity("postgres://reader:secret@db.example:5432/festival")).toBe(
      "db.example:5432/festival",
    );
  });

  it("reaches the IPv6-only Supabase host through the IPv4 session pooler", () => {
    const rewritten = reachableDashboardUrl(
      "postgresql://postgres:s3cret@db.hpzmgvazlegwaiflzusc.supabase.co:5432/postgres",
    );
    const url = new URL(rewritten);
    expect(url.hostname).toBe("aws-0-us-east-1.pooler.supabase.com");
    expect(url.port).toBe("5432");
    expect(decodeURIComponent(url.username)).toBe("postgres.hpzmgvazlegwaiflzusc");
    expect(decodeURIComponent(url.password)).toBe("s3cret");
    expect(url.pathname).toBe("/postgres");
  });

  it("leaves a pooler url and a local url unchanged", () => {
    const pooler = "postgresql://postgres.ref:s3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
    expect(reachableDashboardUrl(pooler)).toBe(pooler);
    expect(reachableDashboardUrl("postgresql://dashboard:dashboard@127.0.0.1:5432/dashboard")).toBe(
      "postgresql://dashboard:dashboard@127.0.0.1:5432/dashboard",
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
