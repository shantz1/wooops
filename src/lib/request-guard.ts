import { NextRequest, NextResponse } from "next/server";
import { authConfigurationError, authEnabled, cookieName, publicOrigin, sessionRole } from "@/lib/auth";

function deny(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
/** Enforced in both Proxy and route handlers; routing is not the sole permission boundary. */
export function authorizeRequest(request: NextRequest): NextResponse | null {
  const path = request.nextUrl.pathname;
  const configurationError = authConfigurationError();
  if (configurationError) return deny(configurationError, 503);
  const origin = publicOrigin() || request.nextUrl.origin;
  if (process.env.NODE_ENV === "production" && origin.startsWith("https:") &&
      request.nextUrl.protocol !== "https:" && request.headers.get("x-forwarded-proto") !== "https") {
    return deny("Serve the panel over HTTPS.", 426);
  }
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (unsafe && (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site")) {
    return deny("Cross-site requests are not allowed.", 403);
  }
  if (path === "/login" || path === "/api/auth/login") return null;
  const role = sessionRole(request.cookies.get(cookieName)?.value);
  if (authEnabled() && !role) return deny("Unauthorized", 401);
  if (role === "readonly" && (unsafe && path !== "/api/auth/logout" || path === "/products/new")) {
    return deny("This login has read-only access.", 403);
  }
  return null;
}
