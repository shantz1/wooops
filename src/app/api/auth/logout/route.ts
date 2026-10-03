import { NextRequest, NextResponse } from "next/server";
import { cookieName } from "@/lib/auth";
import { authorizeRequest } from "@/lib/request-guard";

export async function POST(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
