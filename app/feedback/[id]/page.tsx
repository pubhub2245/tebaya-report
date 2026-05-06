"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getStatusColor, getStatusLabel } from "@/lib/feedbackStatus";

type FeedbackDetail = {
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
  ai_implementation_summary: string | null;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedbackDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [item, setItem] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from("feedback_box")
          .select(
            "id, title, current_problem, proposed_solution, submitter, status, admin_comment, status_updated_at, status_updated_by, created_at, pr_url, pr_number, ai_implementation_summary",
          )
          .eq("id", id)
          .maybeSingle();
        if (err) throw err;
        if (!data) {
          setError("投稿が見つかりませんでした");
        } else {
          setItem(data as FeedbackDetail);
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link
          href="/feedback"
          className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
        >
          ← 一覧へ
        </Link>
        <h1 className="text-base font-bold text-brand-dark">💡 意見の詳細</h1>
        <div className="w-16" />
      </header>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
      {error && (
        <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
          ❌ {error}
        </div>
      )}

      {item && (
        <>
          <div className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold flex-1 break-words">
                {item.title}
              </h2>
              <span
                className={`text-xs font-bold rounded-full px-3 py-1 whitespace-nowrap ${getStatusColor(item.status)}`}
              >
                {getStatusLabel(item.status)}
              </span>
            </div>
            <div className="text-xs text-stone-500 space-y-0.5">
              <div>📝 投稿者：{item.submitter}</div>
              <div>🕒 投稿日時：{formatDateTime(item.created_at)}</div>
            </div>
          </div>

          <section className="card space-y-2">
            <h3 className="font-bold text-sm text-stone-700">
              修正してほしい項目
            </h3>
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {item.current_problem}
            </p>
          </section>

          <section className="card space-y-2">
            <h3 className="font-bold text-sm text-stone-700">
              どのように修正するか
            </h3>
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {item.proposed_solution}
            </p>
          </section>

          {item.admin_comment && (
            <section className="card space-y-2 bg-amber-50 border border-amber-200">
              <h3 className="font-bold text-sm text-amber-900">
                💬 管理者コメント
              </h3>
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-amber-900">
                {item.admin_comment}
              </p>
              {(item.status_updated_at || item.status_updated_by) && (
                <div className="text-xs text-amber-700 pt-1 border-t border-amber-200">
                  {item.status_updated_by && `更新者：${item.status_updated_by}`}
                  {item.status_updated_at &&
                    ` / ${formatDateTime(item.status_updated_at)}`}
                </div>
              )}
            </section>
          )}

          {item.pr_url && (
            <section className="card space-y-2 bg-sky-50 border border-sky-200">
              <h3 className="font-bold text-sm text-sky-900">🔗 関連PR</h3>
              <a
                href={item.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-sky-700 underline break-all"
              >
                {item.pr_number ? `#${item.pr_number} ` : ""}
                {item.pr_url}
              </a>
            </section>
          )}

          {item.ai_implementation_summary && (
            <section className="card space-y-2 bg-violet-50 border border-violet-200">
              <h3 className="font-bold text-sm text-violet-900">
                🤖 AIによる実装内容
              </h3>
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-violet-900">
                {item.ai_implementation_summary}
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
