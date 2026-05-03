import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

/** GET /api/auth/google → Google認可ページへリダイレクト */
export async function GET() {
  try {
    const url = buildAuthUrl();
    return NextResponse.redirect(url);
  } catch (err: any) {
    console.error("[/api/auth/google]", err);
    return NextResponse.json(
      { error: err?.message || "認可URL生成に失敗しました" },
      { status: 500 },
    );
  }
}
