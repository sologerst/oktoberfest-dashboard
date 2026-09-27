import { NextResponse, type NextRequest } from "next/server";
import { BASIC_CHALLENGE, isDashboardRequestAuthorized } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();
  if (isDashboardRequestAuthorized(request.headers.get("authorization"))) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": BASIC_CHALLENGE },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
