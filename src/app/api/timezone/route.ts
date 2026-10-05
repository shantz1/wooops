import { authorizeRequest } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { requestIdentity } from "@/lib/request-guard";
import { readStoreTimezone } from "@/lib/woocommerce/store-timezone";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const identity = requestIdentity(request);
  return NextResponse.json({ ...await readStoreTimezone(), access: { role: identity?.role ?? null, role_label: identity?.roleLabel ?? null,
    name: identity?.name ?? null, user: identity?.login ?? null, permissions: identity?.permissions ?? [] } });
}
