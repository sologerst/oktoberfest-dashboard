import { createHash, timingSafeEqual } from "node:crypto";

export type BasicAuthOptions = {
  user: string | undefined;
  password: string | undefined;
  production: boolean;
};

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

export function authorizeBasicAuth(
  authorization: string | null,
  options: BasicAuthOptions,
): boolean {
  const user = options.user ?? "";
  const password = options.password ?? "";
  if (!user || !password) return !options.production;
  if (!authorization?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return false;
  }
  const splitAt = decoded.indexOf(":");
  if (splitAt < 0) return false;
  return (
    safeEqual(decoded.slice(0, splitAt), user) && safeEqual(decoded.slice(splitAt + 1), password)
  );
}

export function dashboardAuthOptions(): BasicAuthOptions {
  return {
    user: process.env.DASHBOARD_BASIC_AUTH_USER,
    password: process.env.DASHBOARD_BASIC_AUTH_PASSWORD,
    production: isProductionEnv(),
  };
}

export function isDashboardRequestAuthorized(authorization: string | null): boolean {
  return authorizeBasicAuth(authorization, dashboardAuthOptions());
}

export function authorizeCron(
  authorization: string | null,
  options: { secret: string | undefined; production: boolean },
): boolean {
  if (!options.secret) return !options.production;
  return safeEqual(authorization ?? "", `Bearer ${options.secret}`);
}

export function isCronAuthorized(authorization: string | null): boolean {
  const deployed = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
  return authorizeCron(authorization, {
    secret: process.env.CRON_SECRET,
    production: isProductionEnv() || deployed,
  });
}

export const BASIC_CHALLENGE = 'Basic realm="Oktoberfest sales", charset="UTF-8"';
