import { describe, expect, it } from "vitest";
import {
  assertDashboardIsSeparate,
  dashboardConnectionParts,
  databaseIdentity,
  festivalConnectionParts,
  festivalHostsToTry,
  isSupabaseTenantMiss,
} from "@/lib/db";

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

  it("reads the festival database in session mode on its own pooler", () => {
    expect(
      festivalConnectionParts("postgresql://postgres:s3cret@db.festivalref.supabase.co:5432/postgres"),
    ).toMatchObject({
      host: "aws-1-us-east-1.pooler.supabase.com",
      port: 5432,
      user: "postgres.festivalref",
      password: "s3cret",
      database: "postgres",
    });
    expect(
      festivalConnectionParts(
        "postgresql://postgres.festivalref:s3cret@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
      ),
    ).toMatchObject({
      host: "aws-1-us-east-1.pooler.supabase.com",
      port: 5432,
      user: "postgres.festivalref",
    });
    expect(
      festivalConnectionParts("postgresql://postgres:abc#def@db.festivalref.supabase.co:5432/postgres"),
    ).toMatchObject({
      password: "abc#def",
      host: "aws-1-us-east-1.pooler.supabase.com",
    });
    expect(
      festivalConnectionParts(
        "postgresql://postgres:s3cret@abcd1234abcd1234abcd.supabase.co:5432/postgres",
      ),
    ).toMatchObject({
      host: "aws-1-us-east-1.pooler.supabase.com",
      port: 5432,
      user: "postgres.abcd1234abcd1234abcd",
      password: "s3cret",
      database: "postgres",
    });
    expect(
      festivalConnectionParts(
        "postgresql://postgres.abcd1234abcd1234abcd:s3cret@abcd1234abcd1234abcd.supabase.co:5432/postgres",
      ),
    ).toMatchObject({
      host: "aws-1-us-east-1.pooler.supabase.com",
      user: "postgres.abcd1234abcd1234abcd",
    });
    const ref = "xtomvlrezvotveqtoeju";
    const pooler = "aws-1-us-east-1.pooler.supabase.com";
    const session = `postgresql://postgres.${ref}:s3cret@${pooler}:5432/postgres`;
    const pasted = `${session}\npostgresql://postgres:s3cret@db.${ref}.supabase.co:5432/postgres`;
    expect(festivalConnectionParts(pasted)).toMatchObject({
      host: pooler,
      port: 5432,
      user: `postgres.${ref}`,
      password: "s3cret",
      database: "postgres",
    });
    expect(festivalConnectionParts(`${session}postgresql://postgres:s3cret@db.${ref}.supabase.co:5432/postgres`)).toMatchObject({
      database: "postgres",
      user: `postgres.${ref}`,
      password: "s3cret",
    });
    expect(
      festivalConnectionParts(
        `${session} trailing notes that are long enough to make the database name invalid for the pooler`,
      ),
    ).toMatchObject({
      database: "postgres",
      password: "s3cret",
    });
    expect(
      festivalConnectionParts(`postgresql://postgres.${ref}s3cret@${ref}.supabase.co:5432/postgres`),
    ).toMatchObject({
      user: `postgres.${ref}`,
      password: "s3cret",
      database: "postgres",
    });
    expect(festivalHostsToTry("aws-1-us-east-1.pooler.supabase.com")).toEqual([
      "aws-1-us-east-1.pooler.supabase.com",
      "aws-0-us-east-1.pooler.supabase.com",
    ]);
    expect(isSupabaseTenantMiss(new Error("(ENOTFOUND) tenant/user postgres.example not found"))).toBe(true);
    expect(isSupabaseTenantMiss(new Error("password authentication failed for user \"postgres\""))).toBe(false);
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
