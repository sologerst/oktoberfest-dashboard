import { NextResponse, type NextRequest } from "next/server";
import { BASIC_CHALLENGE, isDashboardRequestAuthorized } from "@/lib/auth";

const DB_REVISION = "ipv4-pooler";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/cron/")) {
    const response = NextResponse.next();
    response.headers.set("x-oktoberfest-db", DB_REVISION);
    return response;
  }
  if (isDashboardRequestAuthorized(request.headers.get("authorization"))) {
    const response = NextResponse.next();
    response.headers.set("x-oktoberfest-db", DB_REVISION);
    return response;
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": BASIC_CHALLENGE,
      "x-oktoberfest-db": DB_REVISION,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
