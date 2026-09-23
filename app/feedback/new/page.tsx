"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { STAFF_OPTIONS } from "@/lib/formState";
import { useIsTebaya } from "@/app/components/TebayaOnlyGate";

const TITLE_MAX = 100;

/**
 * ここは「困ったときの窓口」でもあります（→ lib/keiri/support.ts の FEEDBACK_PATH）。
 * 経理パッケージを申し込んだお店は、/keiri/help からこの画面に来ます。
 * ところが 2026-09-24 まで、その方が見ていたのはこういう画面でした：
 *   ・投稿者名が **手羽屋のスタッフ4人の実名から選ぶ**形（自分の名前が無い・よその店の
 *     従業員の名前が見える）
 *   ・送り終わると **手羽屋の意見箱の一覧**（よその店の書き込み）へ飛ばされる
 * 月15,000円に含まれる窓口としては成り立っていないので、
 * よそのお店のときだけ、名前は自由に打てるようにし、送ったあとは一覧へ飛ばしません。
 * ★手羽屋のときは、これまでと1つも変えていません。
 */

export default function FeedbackNewPage() {
  const router = useRouter();
  const { checking: scopeChecking, isTebaya } = useIsTebaya();
  const [sent, setSent] = useState(false);
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
      // 手羽屋は今までどおり一覧へ。よそのお店は、よその店の書き込みが並ぶ一覧へは飛ばさない
      if (isTebaya) router.push("/feedback");
      else setSent(true);
    } catch (e: any) {
      setError(e?.message || "投稿に失敗しました");
      setSubmitting(false);
    }
  };

  // どのお店として開いているかを読む前に画面を出すと、よそのお店に
  // 手羽屋のスタッフ名が一瞬見えてしまうので、読み終わるまで出さない
  if (scopeChecking) {
    return (
      <main className="max-w-md mx-auto px-4 py-5">
        <p className="text-sm text-stone-500">読み込み中…</p>
      </main>
    );
  }

  // 送ったあと（よそのお店のときだけ。手羽屋は今までどおり一覧へ移ります）
  if (sent) {
    return (
      <main className="max-w-md mx-auto px-4 py-6 pb-24 space-y-4">
        <h1 className="text-xl font-bold text-brand-dark">お送りしました</h1>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <p className="text-sm text-emerald-900 leading-relaxed">
            内容を受け取りました。担当が確認して、いただいたご連絡先へお返事します。
          </p>
          <p className="text-xs text-emerald-800 leading-relaxed">
            お急ぎのときは、「困ったとき」のページのメールの窓口からもご連絡いただけます。
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/keiri" className="btn-primary text-center">
            📊 経理の画面へ
          </Link>
          <Link href="/keiri/help" className="btn-secondary text-center">
            ❓ 困ったとき
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link
          href={isTebaya ? "/feedback" : "/keiri/help"}
          className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
        >
          {isTebaya ? "← 一覧へ" : "← 困ったとき"}
        </Link>
        <h1 className="text-xl font-bold text-brand-dark">
          {isTebaya ? "💡 新しい意見" : "💬 お問い合わせ"}
        </h1>
        <div className="w-16" />
      </header>

      <form onSubmit={onSubmit} className="card space-y-4">
        <div>
          <label className="label">{isTebaya ? "投稿者名 *" : "お名前 *"}</label>
          {isTebaya ? (
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
          ) : (
            <input
              type="text"
              className="field"
              value={submitter}
              onChange={(e) => setSubmitter(e.target.value)}
              maxLength={40}
              placeholder="例：〇〇食堂 山田"
              required
            />
          )}
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
          <label className="label">
            {isTebaya ? "修正してほしい項目 *" : "困っていること *"}
          </label>
          <textarea
            className="field min-h-[120px]"
            value={currentProblem}
            onChange={(e) => setCurrentProblem(e.target.value)}
            placeholder="現状の問題点や困っていることを具体的に書いてください"
            required
          />
        </div>

        <div>
          <label className="label">
            {isTebaya ? "どのように修正するか *" : "こうなってほしい（分かる範囲で）*"}
          </label>
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
