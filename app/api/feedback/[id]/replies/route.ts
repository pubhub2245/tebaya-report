import { serverClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { STAFF_OPTIONS } from "@/lib/formState";

export const runtime = "nodejs";

const supabase = serverClient();

interface RouteParams {
  params: { id: string };
}

/**
 * POST /api/feedback/[id]/replies
 *
 * スタッフ返信を投稿する。staff_members（STAFF_OPTIONS）に登録された名前のみ受け付ける。
 * AI / 管理者の自動投稿は別経路（implement API・FeedbackBoxAdmin）で行うため、
 * このエンドポイントは author_type='staff' 固定。
 */
export async function POST(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const feedbackId = params.id;

  if (
    !feedbackId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      feedbackId,
    )
  ) {
    return NextResponse.json(
      { success: false, error: "feedback_id が不正です" },
      { status: 400 },
    );
  }

  let body: { author_name?: unknown; content?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "リクエストボディが不正です" },
      { status: 400 },
    );
  }

  const authorName =
    typeof body.author_name === "string" ? body.author_name.trim() : "";
  const content =
    typeof body.content === "string" ? body.content.trim() : "";

  if (!authorName) {
    return NextResponse.json(
      { success: false, error: "author_name は必須です" },
      { status: 400 },
    );
  }
  if (!content) {
    return NextResponse.json(
      { success: false, error: "content は必須です" },
      { status: 400 },
    );
  }
  if (!STAFF_OPTIONS.includes(authorName)) {
    return NextResponse.json(
      {
        success: false,
        error: `author_name は staff_members に登録された名前のみ受け付けます`,
      },
      { status: 400 },
    );
  }

  // feedback_id の存在確認
  const { data: parent, error: parentErr } = await supabase
    .from("feedback_box")
    .select("id")
    .eq("id", feedbackId)
    .maybeSingle();
  if (parentErr) {
    return NextResponse.json(
      { success: false, error: parentErr.message },
      { status: 500 },
    );
  }
  if (!parent) {
    return NextResponse.json(
      { success: false, error: "対象の意見が存在しません" },
      { status: 404 },
    );
  }

  // INSERT
  const { data, error } = await supabase
    .from("feedback_replies")
    .insert({
      feedback_id: feedbackId,
      author_type: "staff",
      author_name: authorName,
      content,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, reply: data });
}
