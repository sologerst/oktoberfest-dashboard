import { BASIC_CHALLENGE, isDashboardRequestAuthorized } from "@/lib/auth";
import { loadScreenSnapshot } from "@/lib/screen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isDashboardRequestAuthorized(request.headers.get("authorization"))) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": BASIC_CHALLENGE, "Cache-Control": "no-store" },
    });
  }

  const screen = await loadScreenSnapshot();
  return Response.json(screen, {
    headers: { "Cache-Control": "no-store" },
  });
}
