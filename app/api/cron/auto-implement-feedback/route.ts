import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * 意見箱の自動巡回・自動実装トリガー（1時間ごと）。
 *
 * - 新規の未対応投稿（status=pending / まだAI試行なし / PR未作成）を1件だけ選び、
 *   既存の実装API `/api/feedback/[id]/implement` を発火する。
 * - 実際のコード生成・PR作成・上限/重複チェックは実装API側に一任（ここは巡回と発火のみ）。
 * - FEEDBACK_AI_ENABLED=true のときだけ動作（未設定なら何もしない＝課金も発生しない）。
 * - 1回の実行で最大1件（暴走・PR大量発生を防ぐ）。実装API側にも当日上限あり。
 */

export const runtime = "nodejs";
export const maxDuration = 300; // 実装API（計画+生成+PR）を待つため最大5分

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function aiEnabled(): boolean {
  return (process.env.FEEDBACK_AI_ENABLED ?? "").toLowerCase() === "true";
}

export async function GET(req: NextRequest) {
  // ---------- 認証（Vercel Cron / 手動発火とも Bearer CRON_SECRET） ----------
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ---------- 機能フラグ（無効なら何もしない） ----------
  if (!aiEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "FEEDBACK_AI_ENABLED が無効のためスキップ",
    });
  }
  if (!cronSecret) {
    return NextResponse.json({
      ok: false,
      error: "CRON_SECRET 未設定のため実装APIを呼べません",
    });
  }

  // ---------- 対象を1件だけ抽出 ----------
  // 新規（未着手）で、まだAI試行しておらず、PRも無いもの＝新しい投稿のみ。
  // 失敗した投稿は status が reviewing に変わるため、無限リトライにならない。
  const { data: targets, error } = await supabase
    .from("feedback_box")
    .select("id, title, submitter")
    .eq("status", "pending")
    .is("ai_attempted_at", null)
    .is("pr_number", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `対象取得失敗: ${error.message}` },
      { status: 500 },
    );
  }
  if (!targets || targets.length === 0) {
    return NextResponse.json({ ok: true, message: "対象なし（新規の未対応投稿なし）" });
  }

  const target = targets[0];

  // ---------- 実装APIを発火（同一デプロイのオリジンへ） ----------
  const origin = req.nextUrl.origin;
  try {
    const res = await fetch(
      `${origin}/api/feedback/${target.id}/implement`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ attempted_by: "自動巡回(cron)" }),
      },
    );
    const json = await res.json().catch(() => ({}));
    return NextResponse.json({
      ok: res.ok,
      fired: {
        id: target.id,
        title: target.title,
        submitter: target.submitter,
      },
      implement_status: res.status,
      implement_result: json,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: `実装API発火に失敗: ${e?.message || String(e)}`,
        target: target.id,
      },
      { status: 500 },
    );
  }
}
