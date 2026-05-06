"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { STAFF_OPTIONS } from "@/lib/formState";

const TITLE_MAX = 100;

export default function FeedbackNewPage() {
  const router = useRouter();
  const [submitter, setSubmitter] = useState("");
  const [title, setTitle] = useState("");
  const [currentProblem, setCurrentProblem] = useState("");
  const [proposedSolution, setProposedSolution] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    submitter.trim() !== "" &&
    title.trim() !== "" &&
    currentProblem.trim() !== "" &&
    proposedSolution.trim() !== "" &&
    title.length <= TITLE_MAX;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await supabase.from("feedback_box").insert({
        submitter: submitter.trim(),
        title: title.trim(),
        current_problem: currentProblem.trim(),
        proposed_solution: proposedSolution.trim(),
        status: "pending",
      });
      if (err) throw err;
      router.push("/feedback");
    } catch (e: any) {
      setError(e?.message || "投稿に失敗しました");
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link
          href="/feedback"
          className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
        >
          ← 一覧へ
        </Link>
        <h1 className="text-xl font-bold text-brand-dark">💡 新しい意見</h1>
        <div className="w-16" />
      </header>

      <form onSubmit={onSubmit} className="card space-y-4">
        <div>
          <label className="label">投稿者名 *</label>
          <select
            className="field"
            value={submitter}
            onChange={(e) => setSubmitter(e.target.value)}
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
          <label className="label">
            タイトル * <span className="text-xs text-stone-500">（最大{TITLE_MAX}文字）</span>
          </label>
          <input
            type="text"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            placeholder="例：レジ金確認画面の操作性を改善してほしい"
            required
          />
          <div className="text-xs text-stone-500 text-right mt-1">
            {title.length} / {TITLE_MAX}
          </div>
        </div>

        <div>
          <label className="label">修正してほしい項目 *</label>
          <textarea
            className="field min-h-[120px]"
            value={currentProblem}
            onChange={(e) => setCurrentProblem(e.target.value)}
            placeholder="現状の問題点や困っていることを具体的に書いてください"
            required
          />
        </div>

        <div>
          <label className="label">どのように修正するか *</label>
          <textarea
            className="field min-h-[120px]"
            value={proposedSolution}
            onChange={(e) => setProposedSolution(e.target.value)}
            placeholder="こうしてほしい、こんな機能があれば嬉しい、など具体的なアイデア"
            required
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 text-sm font-semibold rounded-xl px-3 py-2">
            ❌ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="btn-primary w-full"
        >
          {submitting ? "投稿中…" : "投稿する"}
        </button>
      </form>
    </main>
  );
}
