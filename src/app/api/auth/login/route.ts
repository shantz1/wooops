import { authorizeRequest } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { authenticateLogin, authenticatePassword, authConfigurationError, authEnabled, cookieName, createSessionToken, sessionSeconds, totpSecretFor } from "@/lib/auth";
import { loginLimiter } from "@/lib/login-limit";
import { limitedText } from "@/lib/request-body";
import { verifyOtp } from "@/lib/otp";
import { identityFor, readAccess } from "@/lib/access";

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
    const accessFingerprint = readAccess().fingerprint;
    // With a username, sign in a named login from the access file; without one, the built-in administrator or read-only login.
    const named = typeof body?.username === "string" && body.username.trim() !== "";
    const loginId = named ? await authenticateLogin(body.username, body?.password) : await authenticatePassword(body?.password);
    if (readAccess().fingerprint !== accessFingerprint) return NextResponse.json({ error: "Access changed during sign-in. Please try again." }, { status: 401 });
    const secret = loginId ? totpSecretFor(loginId) : undefined;
    if (!loginId || secret && !verifyOtp(body?.code, secret)) return NextResponse.json({ error: "Invalid username, password or authenticator code." }, { status: 401 });
    const response = NextResponse.json({ ok: true, role: identityFor(loginId)?.role ?? null });
    response.cookies.set(cookieName, createSessionToken(loginId), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: sessionSeconds,
    });
    return response;
  } catch { return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 }); }
  finally { loginLimiter.release(); }
}
