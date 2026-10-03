import { authorizeRequest } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { authEnabled, cookieName, sessionRole } from "@/lib/auth";
import { readStoreTimezone } from "@/lib/woocommerce/store-timezone";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  return NextResponse.json({ ...await readStoreTimezone(), access: { role: authEnabled() ? sessionRole(request.cookies.get(cookieName)?.value) : "admin" } });
}
