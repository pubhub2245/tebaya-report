"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { STAFF_OPTIONS } from "@/lib/formState";

export type ReplyRow = {
  id: string;
  feedback_id: string;
  author_type: "staff" | "ai" | "admin";
  author_name: string;
  content: string;
  pr_url: string | null;
  created_at: string | null;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${mi}`;
}

function styleForAuthor(type: ReplyRow["author_type"]): {
  card: string;
  icon: string;
  nameSuffix: string;
} {
  switch (type) {
    case "staff":
      return {
        card: "bg-stone-50 border-stone-200",
        icon: "👤",
        nameSuffix: "",
      };
    case "ai":
      return {
        card: "bg-sky-50 border-sky-300",
        icon: "🤖",
        nameSuffix: "",
      };
    case "admin":
      return {
        card: "bg-amber-50 border-amber-300",
        icon: "👑",
        nameSuffix: "（管理者）",
      };
    default:
      return {
        card: "bg-stone-50 border-stone-200",
        icon: "💬",
        nameSuffix: "",
      };
  }
}

export default function ReplyThread({ feedbackId }: { feedbackId: string }) {
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 投稿フォーム state
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("feedback_replies")
        .select(
          "id, feedback_id, author_type, author_name, content, pr_url, created_at",
        )
        .eq("feedback_id", feedbackId)
        .order("created_at", { ascending: true });
      if (err) throw err;
      setReplies((data as ReplyRow[]) ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!feedbackId) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName || !content.trim()) {
      setSubmitError("投稿者名と返信本文を入力してください");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feedback/${feedbackId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_name: authorName,
          content: content.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "投稿に失敗しました");
      }
      // フォームクリア（投稿者名は再利用できるよう残す）
      setContent("");
      await reload();
    } catch (e: any) {
      setSubmitError(e?.message || "投稿に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card space-y-3">
      <h3 className="text-base font-bold text-stone-700">
        💬 返信スレッド
        {replies.length > 0 && (
          <span className="ml-2 text-xs font-normal text-stone-500">
            ({replies.length}件)
          </span>
        )}
      </h3>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-3 py-2 text-sm font-semibold">
          ❌ {error}
        </div>
      )}

      {!loading && !error && replies.length === 0 && (
        <p className="text-sm text-stone-400 italic">
          まだ返信はありません。最初の返信を投稿してみましょう。
        </p>
      )}

      <div className="space-y-2">
        {replies.map((r) => {
          const style = styleForAuthor(r.author_type);
          return (
            <div
              key={r.id}
              className={`border rounded-xl p-3 ${style.card}`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <div className="text-sm font-bold">
                  <span className="mr-1">{style.icon}</span>
                  {r.author_name}
                  {style.nameSuffix && (
                    <span className="ml-1 text-xs text-stone-600 font-normal">
                      {style.nameSuffix}
                    </span>
                  )}
                </div>
                <div className="text-xs text-stone-500">
                  {formatDateTime(r.created_at)}
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                {r.content}
              </p>
              {r.pr_url && (
                <div className="mt-2 text-xs">
                  <a
                    href={r.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-700 underline break-all"
                  >
                    🔗 関連 PR
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 投稿フォーム */}
      <form
        onSubmit={onSubmit}
        className="border-t border-stone-200 pt-3 space-y-2"
      >
        <div>
          <label className="text-xs font-bold text-stone-700 block mb-1">
            投稿者名 *
          </label>
          <select
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="field text-sm"
            disabled={submitting}
            required
          >
            <option value="">— 選択してください —</option>
            {STAFF_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-stone-700 block mb-1">
            返信本文 *
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="field text-sm"
            placeholder="返信を入力してください"
            disabled={submitting}
            required
          />
        </div>

        {submitError && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-2 py-1 text-xs font-semibold">
            ❌ {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !authorName || !content.trim()}
          className="btn-primary w-full text-sm"
        >
          {submitting ? "投稿中…" : "💬 返信を投稿"}
        </button>
      </form>
    </section>
  );
}
