import { isCronAuthorized } from "@/lib/auth";
import { runRefresh } from "@/lib/run-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRefresh();
    if (result.skipped) {
      return Response.json({ ok: true, skipped: true });
    }
    const snapshot = result.snapshot.public;
    console.info("Sales snapshot refreshed", {
      generatedAt: snapshot.generatedAt,
      tickets: snapshot.tickets.status,
      beer: snapshot.beer.status,
      merch: snapshot.merch.status,
      food: snapshot.food.status,
    });
    return Response.json({
      ok: true,
      skipped: false,
      generatedAt: snapshot.generatedAt,
      tickets: snapshot.tickets.status,
      beer: snapshot.beer.status,
      merch: snapshot.merch.status,
      food: snapshot.food.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    console.error("Sales snapshot refresh failed", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
