import { serverClient } from "@/lib/supabaseServer";
/**
 * 意見箱の要望が「完了」になったときに LINE 業務グループへ通知する API。
 *
 * トリガー: 管理画面（FeedbackBoxAdmin.handleSave）がステータスを
 *           prev !== "completed" → next === "completed" に変えて保存成功した直後に呼ぶ。
 *
 * 二重防御:
 *   1) クライアント側で遷移検知してこの API を呼ぶ
 *   2) この API でも DB の status === "completed" を再確認してから送信する
 *
 * DB は変更しない（読むだけ）。
 */

import { NextRequest, NextResponse } from "next/server";
import { sendFeedbackCompletionNotification } from "@/lib/feedback/completionNotify";

export const runtime = "nodejs";
export const maxDuration = 30;

const supabase = serverClient();

/** Authorization: Bearer <ADMIN_PASSWORD|NEXT_PUBLIC_ADMIN_PASSWORD|CRON_SECRET> */
function isAdmin(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m) return false;
  const token = m[1].trim();
  const candidates = [
    process.env.ADMIN_PASSWORD,
    process.env.NEXT_PUBLIC_ADMIN_PASSWORD,
    process.env.CRON_SECRET,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  return candidates.includes(token);
}

interface NotifyParams {
  params: { id: string };
}

export async function POST(
  req: NextRequest,
  { params }: NotifyParams,
): Promise<NextResponse> {
  const id = params.id;

  if (!isAdmin(req)) {
    return NextResponse.json(
      { success: false, error: "認証が必要です" },
      { status: 401 },
    );
  }

  // feedback 取得
  const { data: feedback, error: fetchErr } = await supabase
    .from("feedback_box")
    .select("id, title, submitter, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json(
      { success: false, error: fetchErr.message },
      { status: 500 },
    );
  }
  if (!feedback) {
    return NextResponse.json(
      { success: false, error: "投稿が見つかりません" },
      { status: 404 },
    );
  }

  // サーバー側でも completed を確認（クライアント側との二重防御）
  if (feedback.status !== "completed") {
    return NextResponse.json(
      {
        success: false,
        error: `現在のステータスが completed ではありません（${feedback.status}）`,
      },
      { status: 409 },
    );
  }

  // LINE 送信
  const { sent, message } = await sendFeedbackCompletionNotification({
    title: feedback.title,
    submitter: feedback.submitter,
  });

  if (!sent) {
    return NextResponse.json(
      { success: false, error: "LINE 送信に失敗しました", preview: message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, preview: message });
}
