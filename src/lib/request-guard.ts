import { NextRequest, NextResponse } from "next/server";
import type { Identity } from "@/lib/access";
import { authConfigurationError, authEnabled, cookieName, publicOrigin, sessionIdentity } from "@/lib/auth";
import { allPermissions, meetsRequirement, routePermissions, type Requirement } from "@/lib/permissions";

function deny(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

/** The signed-in login for this request (full access when sign-in is not configured in development). */
export function requestIdentity(request: NextRequest): Identity | null {
  return sessionIdentity(request.cookies.get(cookieName)?.value);
}

function forbidden(identity: Identity) {
  return deny(`Your role (${identity.roleLabel}) does not allow this action.`, 403);
}

/**
 * Enforced in both Proxy and route handlers; routing is not the sole permission boundary.
 * Every API route has a required permission (see routePermissions). Routes that are not listed are refused
 * unless the login has every permission.
 */
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
  const identity = requestIdentity(request);
  if (!identity) return deny("Unauthorized", authEnabled() ? 401 : 503);
  if (path === "/api/auth/logout") return null;
  if (path.startsWith("/api/")) {
    const requirement = routePermissions(request.method, path);
    if (requirement === null) {
      return allPermissions.every(permission => identity.permissions.includes(permission)) ? null : forbidden(identity);
    }
    return meetsRequirement(requirement, identity.permissions) ? null : forbidden(identity);
  }
  // Pages contain no store data (the API is the boundary); the panel explains missing access on screen.
  if (path === "/products/new" && !identity.permissions.includes("products.edit")) return forbidden(identity);
  return null;
}

/** Extra checks that depend on the request body, e.g. a customer-facing note also needs `orders.notify`. */
export function requirePermissions(request: NextRequest, requirement: Requirement): NextResponse | null {
  const identity = requestIdentity(request);
  if (!identity) return deny("Unauthorized", 401);
  return meetsRequirement(requirement, identity.permissions) ? null : forbidden(identity);
}
