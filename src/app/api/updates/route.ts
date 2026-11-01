import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/request-guard";
import { checkLatestRelease, installedUpdateInfo } from "@/lib/release-check";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  return NextResponse.json(request.nextUrl.searchParams.get("check") === "1" ? await checkLatestRelease() : installedUpdateInfo());
}
