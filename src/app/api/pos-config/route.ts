import { after } from "next/server";
import { isDashboardRequestAuthorized } from "@/lib/auth";
import { dashboardDatabaseHost, writePosConfig } from "@/lib/db";
import { validatePosConfig } from "@/lib/pos-config";
import { loadSetupConfig, runRefresh } from "@/lib/run-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function saveFailure(error: unknown): string {
  const host = dashboardDatabaseHost();
  const message = error instanceof Error ? error.message : "Cards could not be saved.";
  console.error("POS config write failed", host, message);
  if (/project address/i.test(message)) {
    return "DASHBOARD_DATABASE_URL is the Supabase project address, not the database connection string. Use the connection string from the Supabase Connect dialog.";
  }
  if (/timeout|timed out/i.test(message)) return `The dashboard database at ${host} did not respond in time. Try again.`;
  if (/password|authentication/i.test(message)) return "The dashboard database rejected the connection. Check DASHBOARD_DATABASE_URL.";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(message)) return `The dashboard database at ${host} could not be reached.`;
  return "Cards could not be saved. Check the dashboard database connection.";
}

function unauthorized() {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  if (!isDashboardRequestAuthorized(request.headers.get("authorization"))) return unauthorized();
  const cards = await loadSetupConfig();
  return Response.json({ cards });
}

export async function POST(request: Request) {
  if (!isDashboardRequestAuthorized(request.headers.get("authorization"))) return unauthorized();
  if (!process.env.DASHBOARD_DATABASE_URL) {
    return Response.json({ ok: false, error: "DASHBOARD_DATABASE_URL is not set." }, { status: 500 });
  }

  let config;
  try {
    const body = (await request.json()) as { cards?: unknown };
    config = validatePosConfig(body.cards);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cards could not be saved.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    await writePosConfig(config);
  } catch (error) {
    return Response.json({ ok: false, error: saveFailure(error) }, { status: 500 });
  }

  after(async () => {
    try {
      await runRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed";
      console.error("Refresh after card save failed", message);
    }
  });

  return Response.json({ ok: true, refreshed: false });
}
