"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  getStatusColor,
  getStatusLabel,
  STATUS_OPTIONS,
  sortKeyForAdmin,
  type FeedbackStatus,
} from "@/lib/feedbackStatus";
import {
  buildClaudeCodePrompt,
  copyToClipboard,
} from "@/lib/feedbackPrompt";

type FeedbackRow = {
  id: string;
  title: string;
  current_problem: string;
  proposed_solution: string;
  submitter: string;
  status: string;
  admin_comment: string | null;
  status_updated_at: string | null;
  status_updated_by: string | null;
  created_at: string | null;
  pr_url: string | null;
  pr_number: number | null;
  pr_state: string | null;
  ai_implementation_summary: string | null;
};

type EditState = {
  status: string;
  admin_comment: string;
  /** 管理者として投稿する返信本文（独立アクション） */
  admin_reply: string;
};

const ADMIN_NAME = "管理者";

/** AI 機能フラグ。NEXT_PUBLIC_FEEDBACK_AI_ENABLED が "true" の時のみボタン表示。
 *  サーバー側は FEEDBACK_AI_ENABLED を見るが、フロントは NEXT_PUBLIC_ プレフィックス必須。 */
const AI_ENABLED =
  (process.env.NEXT_PUBLIC_FEEDBACK_AI_ENABLED ?? "").toLowerCase() === "true";

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedbackBoxAdmin() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, EditState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
    rowId: string;
  } | null>(null);
  const [implementingId, setImplementingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  /** Claude Code 用プロンプトコピー失敗時のフォールバック用テキスト（行IDキー） */
  const [manualCopyText, setManualCopyText] = useState<Record<string, string>>({});

  const handleCopyPrompt = async (row: FeedbackRow) => {
    const text = buildClaudeCodePrompt({
      submitter: row.submitter,
      title: row.title,
      current_problem: row.current_problem,
      proposed_solution: row.proposed_solution,
    });
    const ok = await copyToClipboard(text);
    if (ok) {
      setFeedback({
        kind: "ok",
        text: "Claude Code 用プロンプトをコピーしました",
        rowId: row.id,
      });
      setManualCopyText((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } else {
      setFeedback({
        kind: "err",
        text: "自動コピー失敗。下のテキストを手動でコピーしてください",
        rowId: row.id,
      });
      setManualCopyText((prev) => ({ ...prev, [row.id]: text }));
    }
    setTimeout(() => setFeedback(null), 5000);
  };

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("feedback_box")
        .select(
          "id, title, current_problem, proposed_solution, submitter, status, admin_comment, status_updated_at, status_updated_by, created_at, pr_url, pr_number, pr_state, ai_implementation_summary",
        )
        .order("created_at", { ascending: false });
      if (err) throw err;
      const list = (data as FeedbackRow[]) ?? [];
      setRows(list);
      // 編集 state を初期化（未編集の行のみ）
      setEditState((prev) => {
        const next = { ...prev };
        for (const r of list) {
          if (!next[r.id]) {
            next[r.id] = {
              status: r.status,
              admin_comment: r.admin_comment ?? "",
              admin_reply: "",
            };
          }
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ka = sortKeyForAdmin(a.status);
      const kb = sortKeyForAdmin(b.status);
      if (ka !== kb) return ka - kb;
      // 同じステータス内は新しい順
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [rows]);

  const handleImplement = async (row: FeedbackRow) => {
    if (
      !confirm(
        "Claudeに実装させますか？\n" +
          "API 利用料が発生します（約 ¥30〜100）。\n" +
          "30秒〜2分ほどかかる場合があります。",
      )
    ) {
      return;
    }
    setImplementingId(row.id);
    setFeedback(null);
    try {
      const adminPw = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";
      const res = await fetch(`/api/feedback/${row.id}/implement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminPw}`,
        },
        body: JSON.stringify({ attempted_by: ADMIN_NAME }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "実装依頼に失敗しました");
      }
      setFeedback({
        kind: "ok",
        text: `🎉 PR を作成しました：${data.pr_url}`,
        rowId: row.id,
      });
      await reload();
    } catch (e: any) {
      setFeedback({
        kind: "err",
        text: e?.message || "実装依頼に失敗しました",
        rowId: row.id,
      });
    } finally {
      setImplementingId(null);
      setTimeout(() => setFeedback(null), 8000);
    }
  };

  const handleAdminReply = async (row: FeedbackRow) => {
    const edit = editState[row.id];
    const text = (edit?.admin_reply ?? "").trim();
    if (!text) {
      setFeedback({
        kind: "err",
        text: "返信本文を入力してください",
        rowId: row.id,
      });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    setReplyingId(row.id);
    setFeedback(null);
    try {
      const { error: err } = await supabase.from("feedback_replies").insert({
        feedback_id: row.id,
        author_type: "admin",
        author_name: ADMIN_NAME,
        content: text,
      });
      if (err) throw err;
      // 投稿後はテキストエリアをクリア
      setEditState((prev) => ({
        ...prev,
        [row.id]: { ...prev[row.id], admin_reply: "" },
      }));
      setFeedback({
        kind: "ok",
        text: "管理者として返信を投稿しました",
        rowId: row.id,
      });
    } catch (e: any) {
      setFeedback({
        kind: "err",
        text: e?.message || "返信投稿に失敗しました",
        rowId: row.id,
      });
    } finally {
      setReplyingId(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleSave = async (row: FeedbackRow) => {
    const edit = editState[row.id];
    if (!edit) return;
    // 通知判定：「completed 以外 → completed」への遷移のときだけ後で LINE 通知 API を呼ぶ
    const shouldNotifyCompletion =
      row.status !== "completed" && edit.status === "completed";
    setSavingId(row.id);
    setFeedback(null);
    try {
      const { error: err } = await supabase
        .from("feedback_box")
        .update({
          status: edit.status,
          admin_comment: edit.admin_comment.trim() || null,
          status_updated_at: new Date().toISOString(),
          status_updated_by: ADMIN_NAME,
        })
        .eq("id", row.id);
      if (err) throw err;
      setFeedback({ kind: "ok", text: "保存しました", rowId: row.id });

      // 「完了」へ遷移したときだけ LINE 業務グループへ通知（fire-and-forget・失敗してもUIには出さない）
      if (shouldNotifyCompletion) {
        try {
          const adminPw = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";
          const res = await fetch(
            `/api/feedback/${row.id}/notify-completion`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminPw}`,
              },
            },
          );
          if (res.ok) {
            setFeedback({
              kind: "ok",
              text: "保存しました（LINE 業務グループにも通知済み）",
              rowId: row.id,
            });
          } else {
            const data = await res.json().catch(() => ({}));
            console.warn(
              "[feedback notify-completion] 送信失敗",
              data?.error ?? res.statusText,
            );
            setFeedback({
              kind: "ok",
              text: "保存しました（LINE 通知は失敗：管理者に確認をお願いします）",
              rowId: row.id,
            });
          }
        } catch (notifyErr) {
          console.warn("[feedback notify-completion] 例外", notifyErr);
        }
      }

      await reload();
    } catch (e: any) {
      setFeedback({
        kind: "err",
        text: e?.message || "保存失敗",
        rowId: row.id,
      });
    } finally {
      setSavingId(null);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-xl font-bold text-brand-dark">💡 意見箱の管理</h2>
      <p className="text-xs text-stone-600">
        スタッフから投稿された意見のステータスとコメントを管理します。
      </p>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-3 py-2 text-sm font-semibold">
          ❌ {error}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-stone-500">投稿はまだありません。</p>
      )}

      <div className="space-y-2">
        {sorted.map((row) => {
          const expanded = expandedId === row.id;
          const edit = editState[row.id] ?? {
            status: row.status,
            admin_comment: "",
          };
          const isSaving = savingId === row.id;
          const fb = feedback?.rowId === row.id ? feedback : null;
          return (
            <div
              key={row.id}
              className="border border-stone-200 rounded-xl overflow-hidden"
            >
              {/* ヘッダー（クリックで展開） */}
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : row.id)}
                className="w-full flex items-start justify-between gap-2 px-3 py-2 bg-stone-50 hover:bg-stone-100 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm break-words">
                    {row.title}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    📝 {row.submitter} / 🕒 {formatDateTime(row.created_at)}
                  </div>
                </div>
                <span
                  className={`text-xs font-bold rounded-full px-2 py-1 whitespace-nowrap ${getStatusColor(row.status)}`}
                >
                  {getStatusLabel(row.status)}
                </span>
              </button>

              {/* 展開コンテンツ */}
              {expanded && (
                <div className="p-3 space-y-3 bg-white">
                  <div>
                    <div className="text-xs font-bold text-stone-700 mb-1">
                      修正してほしい項目
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words bg-stone-50 rounded-lg p-2">
                      {row.current_problem}
                    </p>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-stone-700 mb-1">
                      どのように修正するか
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words bg-stone-50 rounded-lg p-2">
                      {row.proposed_solution}
                    </p>
                  </div>

                  {row.pr_url && (
                    <div className="text-xs bg-sky-50 text-sky-900 border border-sky-200 rounded-lg px-2 py-1">
                      🔗 関連PR{row.pr_number ? ` #${row.pr_number}` : ""}：
                      <a
                        href={row.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline break-all"
                      >
                        {row.pr_url}
                      </a>
                      {row.pr_state && (
                        <span className="ml-2 text-stone-600">
                          ({row.pr_state})
                        </span>
                      )}
                    </div>
                  )}

                  {row.ai_implementation_summary && (
                    <details className="text-xs bg-violet-50 text-violet-900 border border-violet-200 rounded-lg px-2 py-1">
                      <summary className="font-bold cursor-pointer">
                        🤖 AIの実装内容
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap break-words">
                        {row.ai_implementation_summary}
                      </p>
                    </details>
                  )}

                  {/* Claude 実装依頼ボタン */}
                  {AI_ENABLED &&
                    !row.pr_url &&
                    (row.status === "pending" || row.status === "reviewing") && (
                      <button
                        type="button"
                        onClick={() => handleImplement(row)}
                        disabled={implementingId === row.id}
                        className="w-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-bold text-sm px-4 py-3 rounded-xl shadow-md transition-colors"
                      >
                        {implementingId === row.id
                          ? "🤖 Claude に実装させています…（30秒〜2分）"
                          : "🤖 Claude に実装依頼"}
                      </button>
                    )}

                  {/* Claude Code 用プロンプトコピー（常時表示・既存ボタンの直下に並べる） */}
                  <button
                    type="button"
                    onClick={() => handleCopyPrompt(row)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm px-4 py-3 rounded-xl shadow-md transition-colors"
                  >
                    📋 Claude Code用にコピー
                  </button>
                  {manualCopyText[row.id] && (
                    <textarea
                      readOnly
                      value={manualCopyText[row.id]}
                      rows={10}
                      className="field text-xs font-mono"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  )}

                  <div className="border-t border-stone-200 pt-3 space-y-2">
                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1">
                        ステータス
                      </label>
                      <select
                        value={edit.status}
                        onChange={(e) =>
                          setEditState((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              status: e.target.value,
                            },
                          }))
                        }
                        className="field text-sm"
                        disabled={isSaving}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1">
                        管理者コメント（任意）
                      </label>
                      <textarea
                        value={edit.admin_comment}
                        onChange={(e) =>
                          setEditState((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              admin_comment: e.target.value,
                            },
                          }))
                        }
                        rows={3}
                        className="field text-sm"
                        placeholder="返信や進捗メモなど"
                        disabled={isSaving}
                      />
                    </div>

                    {(row.status_updated_at || row.status_updated_by) && (
                      <div className="text-xs text-stone-500">
                        前回更新：{row.status_updated_by ?? "-"} /{" "}
                        {formatDateTime(row.status_updated_at)}
                      </div>
                    )}

                    {fb && (
                      <div
                        className={`text-xs font-semibold rounded-lg px-2 py-1 ${
                          fb.kind === "ok"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {fb.kind === "ok" ? "✅" : "❌"} {fb.text}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Link
                        href={`/feedback/${row.id}`}
                        className="btn-secondary text-sm flex-1 text-center"
                      >
                        詳細を開く
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleSave(row)}
                        disabled={isSaving}
                        className="btn-primary text-sm flex-1"
                      >
                        {isSaving ? "保存中…" : "保存"}
                      </button>
                    </div>
                  </div>

                  {/* 管理者として返信（ステータス変更とは独立） */}
                  <div className="border-t border-stone-200 pt-3 space-y-2 bg-amber-50/40 -mx-3 -mb-3 px-3 pb-3 rounded-b-xl">
                    <label className="text-xs font-bold text-amber-900 block">
                      👑 管理者として返信（任意・独立アクション）
                    </label>
                    <textarea
                      value={edit.admin_reply ?? ""}
                      onChange={(e) =>
                        setEditState((prev) => ({
                          ...prev,
                          [row.id]: {
                            ...prev[row.id],
                            admin_reply: e.target.value,
                          },
                        }))
                      }
                      rows={3}
                      className="field text-sm"
                      placeholder="スレッドに管理者として返信する文面（このフォームはステータス変更と無関係）"
                      disabled={replyingId === row.id}
                    />
                    <button
                      type="button"
                      onClick={() => handleAdminReply(row)}
                      disabled={
                        replyingId === row.id ||
                        !(edit.admin_reply ?? "").trim()
                      }
                      className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
                    >
                      {replyingId === row.id
                        ? "投稿中…"
                        : "💬 管理者として返信"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
