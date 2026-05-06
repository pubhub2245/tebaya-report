"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  getStatusColor,
  getStatusLabel,
  STATUS_OPTIONS,
  type FeedbackStatus,
} from "@/lib/feedbackStatus";

type FeedbackRow = {
  id: string;
  title: string;
  submitter: string;
  status: string;
  created_at: string | null;
};

type FilterValue = "all" | FeedbackStatus;

const FILTER_TABS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: "all", label: "すべて" },
  ...STATUS_OPTIONS.map((s) => ({ value: s.value as FilterValue, label: s.label })),
];

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${mi}`;
}

export default function FeedbackListPage() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from("feedback_box")
          .select("id, title, submitter, status, created_at")
          .order("created_at", { ascending: false });
        if (err) throw err;
        setRows((data as FeedbackRow[]) ?? []);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
        >
          🏠 トップ
        </Link>
        <h1 className="text-xl font-bold text-brand-dark">💡 意見箱</h1>
        <div className="w-16" />
      </header>

      <Link
        href="/feedback/new"
        className="block w-full bg-brand hover:bg-brand-dark text-white font-bold text-base px-6 py-4 rounded-xl shadow-md text-center transition-colors"
      >
        💡 新しい意見を投稿する
      </Link>

      <div className="card">
        <p className="text-sm text-stone-600">
          スタッフからの改善提案・要望を集める場所です。投稿は全員が閲覧できます。
        </p>
      </div>

      {/* タブフィルタ */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTER_TABS.map((t) => {
          const active = filter === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setFilter(t.value)}
              className={`whitespace-nowrap text-sm rounded-full px-4 py-1.5 font-semibold border ${
                active
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-stone-600 border-stone-300"
              }`}
            >
              {t.label}
              {t.value !== "all" && (
                <span className="ml-1 text-xs opacity-70">
                  ({rows.filter((r) => r.status === t.value).length})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
      {error && (
        <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
          ❌ {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-center text-stone-400 py-8 text-sm">
          {filter === "all"
            ? "投稿はまだありません。最初の意見を投稿してみましょう。"
            : `「${getStatusLabel(filter)}」の投稿はありません。`}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((r) => (
          <Link
            key={r.id}
            href={`/feedback/${r.id}`}
            className="block card hover:shadow-md transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base mb-1 break-words">
                  {r.title}
                </div>
                <div className="text-xs text-stone-500 flex items-center gap-2 flex-wrap">
                  <span>📝 {r.submitter}</span>
                  <span>🕒 {formatDate(r.created_at)}</span>
                </div>
              </div>
              <span
                className={`text-xs font-bold rounded-full px-2 py-1 ${getStatusColor(r.status)}`}
              >
                {getStatusLabel(r.status)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
