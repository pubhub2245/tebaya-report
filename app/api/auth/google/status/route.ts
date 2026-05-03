import { NextResponse } from "next/server";
import { getStoredToken, PRIMARY_GMAIL_USER } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

/**
 * GET /api/auth/google/status
 * 現在の Gmail 認証状態を返す。
 *
 * レスポンス:
 *   { connected: false }
 *   { connected: true, email: "...", expiresAt: "...", expired: false }
 */
export async function GET() {
  try {
    const stored = await getStoredToken(PRIMARY_GMAIL_USER);
    if (!stored) {
      return NextResponse.json({ connected: false });
    }
    const expiry = new Date(stored.expiry_date).getTime();
    const expired = expiry - Date.now() < 0;
    return NextResponse.json({
      connected: true,
      email: stored.user_email,
      expiresAt: stored.expiry_date,
      expired,
      hasRefreshToken: !!stored.refresh_token,
    });
  } catch (err: any) {
    console.error("[/api/auth/google/status]", err);
    return NextResponse.json(
      { connected: false, error: err?.message || "status check failed" },
      { status: 500 },
    );
  }
}
