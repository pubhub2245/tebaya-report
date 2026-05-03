import { NextResponse } from "next/server";
import { deleteStoredToken, PRIMARY_GMAIL_USER } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

/**
 * POST /api/auth/google/disconnect
 * トークンを DB から削除して連携を解除する。
 * Google 側のリボーク（access tokenの無効化）は行っていないので、
 * 厳密にはGoogleアカウントのアプリ管理から「アクセス権削除」をユーザーが行うことが望ましい。
 */
export async function POST() {
  try {
    await deleteStoredToken(PRIMARY_GMAIL_USER);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/auth/google/disconnect]", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "切断に失敗しました",
      },
      { status: 500 },
    );
  }
}
