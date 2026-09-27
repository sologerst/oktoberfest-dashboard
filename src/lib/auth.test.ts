import { describe, expect, it } from "vitest";
import { authorizeBasicAuth, authorizeCron } from "@/lib/auth";

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

describe("dashboard auth", () => {
  it("accepts the configured user", () => {
    expect(
      authorizeBasicAuth(basic("gate", "secret"), { user: "gate", password: "secret", production: true }),
    ).toBe(true);
  });

  it("rejects a wrong password and a missing header", () => {
    const options = { user: "gate", password: "secret", production: true };
    expect(authorizeBasicAuth(basic("gate", "nope"), options)).toBe(false);
    expect(authorizeBasicAuth(null, options)).toBe(false);
  });

  it("locks production when credentials are missing and stays open in development", () => {
    expect(authorizeBasicAuth(null, { user: "", password: "", production: true })).toBe(false);
    expect(authorizeBasicAuth(null, { user: "", password: "", production: false })).toBe(true);
  });

  it("checks the cron bearer secret", () => {
    expect(authorizeCron("Bearer night", { secret: "night", production: true })).toBe(true);
    expect(authorizeCron("Bearer day", { secret: "night", production: true })).toBe(false);
    expect(authorizeCron(null, { secret: undefined, production: true })).toBe(false);
    expect(authorizeCron(null, { secret: undefined, production: false })).toBe(true);
  });
});
