import { NextRequest, NextResponse } from "next/server";
import { fetchRequestEmails } from "@/lib/gmail/fetch-emails";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/shift-generator/email/list?months=6
 *
 * じゅんさん→大田原さん宛ての希望メール一覧を取得して返す。
 * plaintextBody はリスト表示では不要なため省略する（snippet は残す）。
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const monthsRaw = url.searchParams.get("months");
    const months = monthsRaw ? parseInt(monthsRaw, 10) : 6;
    if (!Number.isFinite(months) || months < 1 || months > 24) {
      return NextResponse.json(
        { error: "months は 1〜24 の整数で指定してください" },
        { status: 400 },
      );
    }

    const messages = await fetchRequestEmails({ months });
    // 一覧表示では本文を省略（容量・速度のため）
    const stripped = messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      subject: m.subject,
      from: m.from,
      to: m.to,
      date: m.date,
      snippet: m.snippet,
    }));

    return NextResponse.json({ messages: stripped, count: stripped.length });
  } catch (err: any) {
    console.error("[email/list]", err);
    const msg = err?.message || "メール取得に失敗しました";
    const needsReauth = /再認証|未保存/.test(msg);
    return NextResponse.json(
      { error: msg, needsReauth },
      { status: needsReauth ? 401 : 500 },
    );
  }
}
