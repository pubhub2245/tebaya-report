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
};

const ADMIN_NAME = "管理者";

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

  const handleSave = async (row: FeedbackRow) => {
    const edit = editState[row.id];
    if (!edit) return;
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
      await reload();
    } catch (e: any) {
      setFeedback({
        kind: "err",
        text: e?.message || "保存失敗",
        rowId: row.id,
      });
    } finally {
      setSavingId(null);
      setTimeout(() => setFeedback(null), 4000);
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
