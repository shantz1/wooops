import { authorizeRequest } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { authenticatePassword, authConfigurationError, authEnabled, cookieName, createSessionToken, sessionSeconds } from "@/lib/auth";
import { loginLimiter } from "@/lib/login-limit";
import { limitedText } from "@/lib/request-body";
import { verifyOtp } from "@/lib/otp";

export async function POST(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const configurationError = authConfigurationError();
  if (configurationError) return NextResponse.json({ error: configurationError }, { status: 503 });
  if (!authEnabled()) return NextResponse.json({ error: "Login is not configured." }, { status: 503 });
  const slot = loginLimiter.acquire();
  if (!slot.allowed) return NextResponse.json({ error: "Too many sign-in attempts. Wait and try again." }, { status: 429, headers: { "Retry-After": String(slot.retryAfter) } });
  try {
    const body = JSON.parse(await limitedText(request, 4096));
    const role = await authenticatePassword(body?.password);
    const secret = role === "readonly" ? process.env.WOOOPS_READONLY_TOTP_SECRET : process.env.WOOOPS_ADMIN_TOTP_SECRET;
    if (!role || secret && !verifyOtp(body?.code, secret)) return NextResponse.json({ error: "Invalid password or authenticator code." }, { status: 401 });
    const response = NextResponse.json({ ok: true, role });
    response.cookies.set(cookieName, createSessionToken(role), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: sessionSeconds,
    });
    return response;
  } catch { return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 }); }
  finally { loginLimiter.release(); }
}
