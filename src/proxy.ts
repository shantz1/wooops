import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/auth";
import { authorizeRequest } from "@/lib/request-guard";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/woo/webhooks") return privateResponse(NextResponse.next());
  const denied = authorizeRequest(request);
  if (denied?.status === 401 && !request.nextUrl.pathname.startsWith("/api/")) {
    return privateResponse(NextResponse.redirect(new URL("/login", publicOrigin() || request.nextUrl.origin)));
  }
  return privateResponse(denied || NextResponse.next());
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|wo.svg).*)"] };
