import { isDashboardRequestAuthorized } from "@/lib/auth";
import { writePosConfig } from "@/lib/db";
import { validatePosConfig } from "@/lib/pos-config";
import { loadSetupConfig, runRefresh } from "@/lib/run-refresh";

export const dynamic = "force-dynamic";

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

  await writePosConfig(config);
  try {
    await runRefresh();
    return Response.json({ ok: true, refreshed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    console.error("Refresh after card save failed", message);
    return Response.json({ ok: true, refreshed: false, error: message });
  }
}
