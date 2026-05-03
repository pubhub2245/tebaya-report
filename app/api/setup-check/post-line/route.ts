import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";

export const runtime = "nodejs";

/**
 * POST /api/setup-check/post-line
 *
 * setup_checks レコードIDを受け取り、line_text を LINE 合同グループへ投稿。
 * 投稿成功後に line_posted_at を UPDATE する。
 *
 * 既に line_posted_at が入っているレコードは二重投稿防止のため弾く。
 *
 * 設営後チェックは既存運用フォーマット維持のため、
 * transformWithCurrentCharacter による月替わりキャラ装飾は通さず
 * line_text をそのまま送信する。
 */
export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { success: false, error: "id は必須です" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data: record, error: fetchError } = await supabase
      .from("setup_checks")
      .select("id, line_text, line_posted_at")
      .eq("id", id)
      .single();

    if (fetchError || !record) {
      return NextResponse.json(
        { success: false, error: "レコードが見つかりません" },
        { status: 404 },
      );
    }

    if (record.line_posted_at) {
      return NextResponse.json(
        { success: false, error: "このチェックは既にLINE投稿済みです" },
        { status: 400 },
      );
    }

    if (!record.line_text || record.line_text.trim() === "") {
      return NextResponse.json(
        { success: false, error: "投稿用テキストがありません" },
        { status: 400 },
      );
    }

    const sent = await sendLineGroupMessage(record.line_text);
    if (!sent) {
      return NextResponse.json(
        { success: false, error: "LINE投稿に失敗しました" },
        { status: 500 },
      );
    }

    const postedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("setup_checks")
      .update({ line_posted_at: postedAt })
      .eq("id", id);

    if (updateError) {
      console.warn(
        "[setup-check/post-line] line_posted_at の更新に失敗:",
        updateError,
      );
    }

    return NextResponse.json({ success: true, posted_at: postedAt });
  } catch (error) {
    console.error("[setup-check/post-line]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "LINE投稿に失敗しました",
      },
      { status: 500 },
    );
  }
}
