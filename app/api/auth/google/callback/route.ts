import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndStore } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

/**
 * GET /api/auth/google/callback?code=...
 * Google からのリダイレクトを受け取り、トークン交換 → DB 保存 → 管理画面へリダイレクト。
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    // ユーザーが認可拒否 or Google 側エラー
    const back = new URL("/admin/shift-generator", url.origin);
    back.searchParams.set("oauth_error", error);
    return NextResponse.redirect(back);
  }

  if (!code) {
    return NextResponse.json(
      { error: "認可コード(code) が見つかりません" },
      { status: 400 },
    );
  }

  try {
    await exchangeCodeAndStore(code);
    const back = new URL("/admin/shift-generator", url.origin);
    back.searchParams.set("oauth", "success");
    return NextResponse.redirect(back);
  } catch (err: any) {
    console.error("[/api/auth/google/callback]", err);
    const back = new URL("/admin/shift-generator", url.origin);
    back.searchParams.set("oauth_error", err?.message || "token_exchange_failed");
    return NextResponse.redirect(back);
  }
}
