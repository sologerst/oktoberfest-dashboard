import { describe, expect, it } from "vitest";
import { assertDashboardIsSeparate, dashboardConnectionParts, databaseIdentity } from "@/lib/db";

describe("database targets", () => {
  it("identifies a database without its password", () => {
    expect(databaseIdentity("postgres://reader:secret@db.example:5432/festival")).toBe(
      "db.example:5432/festival",
    );
  });

  it("reaches the IPv6-only Supabase host through the IPv4 session pooler", () => {
    expect(
      dashboardConnectionParts("postgresql://postgres:s3cret@db.hpzmgvazlegwaiflzusc.supabase.co:5432/postgres"),
    ).toMatchObject({
      host: "aws-0-us-east-1.pooler.supabase.com",
      port: 5432,
      user: "postgres.hpzmgvazlegwaiflzusc",
      password: "s3cret",
      database: "postgres",
    });
  });

  it("keeps a password that would break a URL", () => {
    expect(
      dashboardConnectionParts(
        "postgresql://postgres:abc#def@db.hpzmgvazlegwaiflzusc.supabase.co:5432/postgres",
      ),
    ).toMatchObject({
      host: "aws-0-us-east-1.pooler.supabase.com",
      user: "postgres.hpzmgvazlegwaiflzusc",
      password: "abc#def",
    });
    expect(
      dashboardConnectionParts("postgresql://postgres:p@ss@db.hpzmgvazlegwaiflzusc.supabase.co:5432/postgres"),
    ).toMatchObject({
      password: "p@ss",
      host: "aws-0-us-east-1.pooler.supabase.com",
    });
  });

  it("reaches the project API host through the IPv4 session pooler", () => {
    expect(
      dashboardConnectionParts("postgresql://postgres:s3cret@hpzmgvazlegwaiflzusc.supabase.co:5432/postgres"),
    ).toMatchObject({
      host: "aws-0-us-east-1.pooler.supabase.com",
      port: 5432,
      user: "postgres.hpzmgvazlegwaiflzusc",
      password: "s3cret",
      database: "postgres",
    });
  });

  it("keeps a password that starts with a hash", () => {
    expect(
      dashboardConnectionParts(
        "postgresql://postgres:#secret@db.hpzmgvazlegwaiflzusc.supabase.co:5432/postgres",
      ),
    ).toMatchObject({
      host: "aws-0-us-east-1.pooler.supabase.com",
      user: "postgres.hpzmgvazlegwaiflzusc",
      password: "#secret",
    });
  });

  it("refuses the Supabase project URL because it is not Postgres", () => {
    expect(() => dashboardConnectionParts("https://hpzmgvazlegwaiflzusc.supabase.co")).toThrow(/project address/);
  });

  it("leaves a pooler url and a local url unchanged", () => {
    expect(
      dashboardConnectionParts("postgresql://postgres.ref:s3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres"),
    ).toMatchObject({
      host: "aws-0-us-east-1.pooler.supabase.com",
      user: "postgres.ref",
      password: "s3cret",
    });
    expect(dashboardConnectionParts("postgresql://dashboard:dashboard@127.0.0.1:5432/dashboard")).toMatchObject({
      host: "127.0.0.1",
      port: 5432,
      user: "dashboard",
      database: "dashboard",
    });
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
