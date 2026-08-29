import { serverClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import {
  planImplementation,
  generateCode,
  type FeedbackPostInput,
  type FileSummaryForPlan,
  type FullFileForCode,
} from "@/lib/anthropicClient";
import {
  createBranch,
  commitFile,
  createPullRequest,
  getFileContent,
  getRepoFileTree,
} from "@/lib/githubClient";

export const runtime = "nodejs";
export const maxDuration = 300; // 計画 + コード生成 + GitHub 操作で最大5分

const DEFAULT_DAILY_LIMIT = 5;
const MAX_FILES_GENERATED = 20;
const MAX_LINES_PER_FILE = 2000;

const supabase = serverClient();

/** 簡易管理者認証。
 * Authorization: Bearer <NEXT_PUBLIC_ADMIN_PASSWORD or ADMIN_PASSWORD or CRON_SECRET>
 * いずれかが一致すれば許可。
 */
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

function aiEnabled(): boolean {
  return (process.env.FEEDBACK_AI_ENABLED ?? "").toLowerCase() === "true";
}

function dailyLimit(): number {
  const v = parseInt(process.env.FEEDBACK_AI_DAILY_LIMIT ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAILY_LIMIT;
}

/** safe な短縮 ID（先頭8文字）でブランチ名に使う */
function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 8);
}

/** 行数カウント */
function countLines(s: string): number {
  if (!s) return 0;
  return s.split(/\r\n|\r|\n/).length;
}

interface ImplementParams {
  params: { id: string };
}

export async function POST(
  req: NextRequest,
  { params }: ImplementParams,
): Promise<NextResponse> {
  const id = params.id;

  // ---------- 認証チェック ----------
  if (!isAdmin(req)) {
    return NextResponse.json(
      { success: false, error: "認証が必要です" },
      { status: 401 },
    );
  }

  // ---------- 機能フラグ ----------
  if (!aiEnabled()) {
    return NextResponse.json(
      {
        success: false,
        error: "FEEDBACK_AI_ENABLED が有効化されていません",
      },
      { status: 403 },
    );
  }

  // ---------- リクエストボディ（依頼者名など） ----------
  let attemptedBy = "管理者";
  try {
    const body = await req.json();
    if (typeof body?.attempted_by === "string" && body.attempted_by.trim()) {
      attemptedBy = body.attempted_by.trim();
    }
  } catch {
    // body 無くても OK
  }

  // ---------- 当日上限チェック ----------
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data: todayRows, error: todayErr } = await supabase
    .from("feedback_box")
    .select("id")
    .gte("ai_attempted_at", startOfDay.toISOString());
  if (todayErr) {
    return NextResponse.json(
      { success: false, error: `上限チェック失敗: ${todayErr.message}` },
      { status: 500 },
    );
  }
  const limit = dailyLimit();
  if ((todayRows?.length ?? 0) >= limit) {
    return NextResponse.json(
      {
        success: false,
        error: `本日の上限（${limit}件）に達しました。明日以降に再度お試しください`,
      },
      { status: 429 },
    );
  }

  // ---------- 重複実行防止 ----------
  const { data: dupRows, error: dupErr } = await supabase
    .from("feedback_box")
    .select("id, pr_state")
    .eq("id", id)
    .in("pr_state", ["draft", "open"]);
  if (dupErr) {
    return NextResponse.json(
      { success: false, error: `重複チェック失敗: ${dupErr.message}` },
      { status: 500 },
    );
  }
  if ((dupRows?.length ?? 0) > 0) {
    return NextResponse.json(
      {
        success: false,
        error: "この投稿は既に PR が作成されています（draft または open）",
      },
      { status: 409 },
    );
  }

  // ---------- feedback 取得 ----------
  const { data: feedback, error: fetchErr } = await supabase
    .from("feedback_box")
    .select(
      "id, title, current_problem, proposed_solution, submitter, status",
    )
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

  // ---------- ステータス更新（試行開始マーク） ----------
  const nowIso = new Date().toISOString();
  await supabase
    .from("feedback_box")
    .update({
      status: "in_progress",
      ai_attempted_at: nowIso,
      ai_attempted_by: attemptedBy,
      ai_error: null,
    })
    .eq("id", id);

  /** AI（Claude）として返信を1件投稿。失敗してもメイン処理は止めない */
  async function postAiReply(content: string, prUrl: string | null = null) {
    const trimmed = (content ?? "").trim();
    if (!trimmed) return;
    try {
      await supabase.from("feedback_replies").insert({
        feedback_id: id,
        author_type: "ai",
        author_name: "Claude AI",
        content: trimmed,
        pr_url: prUrl,
      });
    } catch (e) {
      console.warn("[implement] AI reply 投稿失敗（継続）", e);
    }
  }

  /** エラーで終了する共通処理: ステータスを reviewing に戻し ai_error を保存し、AI返信も投稿 */
  async function failAndRespond(message: string, status: number) {
    await supabase
      .from("feedback_box")
      .update({
        status: "reviewing",
        ai_error: message.slice(0, 1000),
      })
      .eq("id", id);
    // システム固定文として AI 返信を投稿（短く要約）
    const short = message.length > 200 ? message.slice(0, 200) + "…" : message;
    await postAiReply(
      `実装中にエラーが発生しました：${short}\n管理者に確認をお願いします。`,
    );
    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }

  const post: FeedbackPostInput = {
    title: feedback.title,
    current_problem: feedback.current_problem,
    proposed_solution: feedback.proposed_solution,
    submitter: feedback.submitter,
  };

  // ---------- 4. リポジトリ構造取得 ----------
  let fileSummaries: FileSummaryForPlan[] = [];
  try {
    const tree = await getRepoFileTree();
    // 多すぎる場合は先頭150件に絞る
    const targetPaths = tree.slice(0, 150).map((t) => t.path);
    // 各ファイルの先頭50行サマリ
    const summaries = await Promise.all(
      targetPaths.map(async (p) => {
        try {
          const { content } = await getFileContent(p);
          const preview = content.split(/\r\n|\r|\n/).slice(0, 50).join("\n");
          return { path: p, preview };
        } catch {
          return { path: p, preview: "(取得失敗)" };
        }
      }),
    );
    fileSummaries = summaries;
  } catch (e: any) {
    return failAndRespond(
      `リポジトリ取得失敗: ${e?.message || String(e)}`,
      500,
    );
  }

  // ---------- 5. Anthropic 第1段階: 計画 ----------
  let plan;
  try {
    plan = await planImplementation(post, fileSummaries);
  } catch (e: any) {
    return failAndRespond(
      `計画生成失敗（Anthropic）: ${e?.message || String(e)}`,
      500,
    );
  }

  if (plan.feasibility !== "feasible") {
    // 却下/保留: AI が生成した staff_reply を AI 返信として投稿
    const replyText =
      plan.staff_reply && plan.staff_reply.trim()
        ? plan.staff_reply.trim()
        : `この要望は「${plan.feasibility}」と判定しました：${plan.feasibility_reason}\n別案がございましたら追加でご投稿ください。`;
    await supabase
      .from("feedback_box")
      .update({
        status: "reviewing",
        ai_error: `AI 判定: ${plan.feasibility}（${plan.feasibility_reason}）`.slice(0, 1000),
      })
      .eq("id", id);
    await postAiReply(replyText);
    return NextResponse.json(
      {
        success: false,
        error: `AI が「${plan.feasibility}」と判定しました: ${plan.feasibility_reason}`,
        staff_reply: replyText,
      },
      { status: 422 },
    );
  }

  // ---------- 6. 関連ファイル取得 ----------
  const fullFiles: FullFileForCode[] = [];
  for (const path of plan.files_to_read_first.slice(0, 10)) {
    try {
      const { content } = await getFileContent(path);
      fullFiles.push({ path, content });
    } catch {
      // 取得できなかったファイルはスキップ
    }
  }

  // ---------- 7. Anthropic 第2段階: コード生成 ----------
  let generated;
  try {
    generated = await generateCode(post, plan, fullFiles);
  } catch (e: any) {
    return failAndRespond(
      `コード生成失敗（Anthropic）: ${e?.message || String(e)}`,
      500,
    );
  }

  // ---------- 安全装置（ファイル数・行数・package.json） ----------
  if (generated.files.length === 0) {
    return failAndRespond("AI が変更ファイルを返しませんでした", 422);
  }
  if (generated.files.length > MAX_FILES_GENERATED) {
    return failAndRespond(
      `変更ファイル数が ${generated.files.length} 件で上限 ${MAX_FILES_GENERATED} を超過`,
      422,
    );
  }
  for (const f of generated.files) {
    if (countLines(f.content) > MAX_LINES_PER_FILE) {
      return failAndRespond(
        `${f.path}: ${countLines(f.content)} 行で上限 ${MAX_LINES_PER_FILE} 行を超過`,
        422,
      );
    }
    if (f.path === "package.json" || f.path === "package-lock.json") {
      return failAndRespond(
        "依存追加が必要な変更（package.json / lock 修正）は自動却下",
        422,
      );
    }
    if (f.path.includes("..") || f.path.startsWith("/")) {
      return failAndRespond(`不正なパス: ${f.path}`, 422);
    }
  }

  // ---------- 8. GitHub 操作 ----------
  const branchName = `feature/feedback-${shortId(id)}`;
  try {
    await createBranch(branchName, "master");
  } catch (e: any) {
    return failAndRespond(
      `ブランチ作成失敗: ${e?.message || String(e)}`,
      500,
    );
  }

  // 各ファイルを順次コミット
  for (const f of generated.files) {
    try {
      await commitFile(branchName, f.path, f.content, generated.commit_message);
    } catch (e: any) {
      return failAndRespond(
        `コミット失敗 ${f.path}: ${e?.message || String(e)}`,
        500,
      );
    }
  }

  // PR 作成
  let prInfo: { url: string; number: number };
  try {
    prInfo = await createPullRequest(
      branchName,
      generated.pr_title,
      `${generated.pr_body}\n\n---\n意見箱投稿 ID: ${id}\n投稿者: ${post.submitter}\nタイトル: ${post.title}`,
      true,
      ["ai-generated"],
    );
  } catch (e: any) {
    return failAndRespond(
      `PR作成失敗: ${e?.message || String(e)}`,
      500,
    );
  }

  // ---------- 9. feedback_box に保存 ----------
  await supabase
    .from("feedback_box")
    .update({
      pr_url: prInfo.url,
      pr_number: prInfo.number,
      pr_state: "draft",
      ai_implementation_summary: plan.implementation_summary,
    })
    .eq("id", id);

  // ---------- 9.5. AI 返信を自動投稿（成功時） ----------
  const successReply =
    generated.staff_reply && generated.staff_reply.trim()
      ? generated.staff_reply.trim()
      : `ご投稿ありがとうございます。ご要望に沿った実装案を作成し、PR (#${prInfo.number}) として準備しました。\n${plan.implementation_summary || ""}\n内容をレビューのうえマージいたします。テスト推奨：該当機能の動作確認をお願いします。`;
  await postAiReply(successReply, prInfo.url);

  // ---------- 10. レスポンス ----------
  return NextResponse.json({
    success: true,
    pr_url: prInfo.url,
    pr_number: prInfo.number,
    files_changed: generated.files.length,
    branch: branchName,
  });
}
