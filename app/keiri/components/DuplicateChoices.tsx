"use client";

/**
 * 「同じ支払いが2か所に書かれている疑い」を、押して片付ける所（kp230・f1-5）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   日報の「レジから払った経費」と、立て替えの台帳の両方に、
 *   同じ日・同じ金額の支払いが入っていることがあります。
 *   両方そのまま数えると、**その月にかかったお金が多く出ます**。
 *   2026-10-03 から疑いは出していましたが、**片付ける道が無く**、
 *   毎月 同じ疑いを見続けることになっていました。
 *
 * ■ ここでやること
 *   1組ごとに、どちらを数えるかを押して決めます（3つ）。
 *   ・日報のほうだけ数える ・立て替えのほうだけ数える ・別々の支払いなので両方数える
 *   **元の記録は消えません。** 決めたあとは「数えていません」と出して、元に戻せます。
 *
 * ■ 書くのはここではありません
 *   押したときに何をするかは、呼んだ側（経理画面／お試し版）が決めます。
 *   お試し版は倉庫に1行も書かず、画面の中だけで覚えます（f4-2）。
 *
 * ■ 言葉は司令室の材料のまま（meta/keiri-material-kasanari-kotoba・B2）
 *   lib/keiri/expenseIgnores.ts の IGNORE_WORDS だけが文を持ちます（2か所に書かない）。
 */

import type { DuplicateSuspect } from "@/lib/keiri/duplicates";
import {
  IGNORE_WORDS,
  canChoose,
  suspectDecision,
  suspectKeys,
  type IgnoreChoice,
  type IgnoreMarks,
  type IgnoreShelfState,
} from "@/lib/keiri/expenseIgnores";

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

export default function DuplicateChoices({
  suspects,
  marks,
  shelf,
  busy,
  message,
  onChoose,
  onUndo,
}: {
  suspects: DuplicateSuspect[];
  marks: IgnoreMarks;
  /** 印を置く棚があるか（まだ無いときはボタンを出さず「準備中です」と出す） */
  shelf: IgnoreShelfState;
  /** いま書き込み中の組（合言葉）。二度押しを防ぐため */
  busy?: string | null;
  message?: string | null;
  onChoose: (suspect: DuplicateSuspect, choice: IgnoreChoice) => void;
  onUndo: (suspect: DuplicateSuspect) => void;
}) {
  if (suspects.length === 0) {
    return (
      <p className="text-xs text-stone-500">{IGNORE_WORDS.allClear}</p>
    );
  }

  const pending = suspects.filter((s) => suspectDecision(s, marks) === "pending");
  const pendingTotal = pending.reduce((t, s) => t + s.amount, 0);
  const ready = shelf === "ready";

  return (
    <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 space-y-3">
      <p className="font-bold">
        {pending.length > 0
          ? `同じ支払いが2か所に書かれているかもしれません（${pending.length}件・合計 ${yen(pendingTotal)}）`
          : "同じ支払いの疑いは、ぜんぶ片付いています"}
      </p>
      {pending.length > 0 && <p className="leading-relaxed">{IGNORE_WORDS.lead}</p>}

      {!ready && (
        <p className="rounded bg-white/70 px-2 py-1 leading-relaxed text-amber-800">
          {IGNORE_WORDS.notReady}
        </p>
      )}

      <ul className="space-y-3">
        {suspects.map((s) => {
          const keys = suspectKeys(s);
          const key = `${keys.report}/${keys.advance}`;
          const decision = suspectDecision(s, marks);
          const working = busy === key;
          return (
            <li key={key} className="rounded border border-amber-200 bg-white/80 p-2 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="tabular-nums">
                  <p className="font-bold">日報の記録</p>
                  <p>
                    {s.report.date}　{s.report.description || "（説明なし）"}　{yen(s.amount)}
                  </p>
                </div>
                <div className="tabular-nums">
                  <p className="font-bold">立て替えの記録</p>
                  <p>
                    {s.advance.date}　{s.advance.description || "（説明なし）"}　{yen(s.amount)}
                  </p>
                </div>
              </div>

              {!s.sameMonth && <p className="text-amber-800">{IGNORE_WORDS.crossMonth}</p>}

              {decision === "pending" ? (
                ready && canChoose(s) ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => onChoose(s, "count-report")}
                      className="rounded border border-amber-500 bg-white px-2 py-1 font-bold disabled:opacity-50"
                    >
                      {IGNORE_WORDS.chooseReport}
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => onChoose(s, "count-advance")}
                      className="rounded border border-amber-500 bg-white px-2 py-1 font-bold disabled:opacity-50"
                    >
                      {IGNORE_WORDS.chooseAdvance}
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => onChoose(s, "both")}
                      className="rounded border border-stone-400 bg-white px-2 py-1 disabled:opacity-50"
                    >
                      {IGNORE_WORDS.chooseBoth}
                    </button>
                  </div>
                ) : ready ? (
                  <p className="text-amber-800">
                    この組は元の記録の番号が読めないので、ここでは選べません。中身を確かめてから直してください。
                  </p>
                ) : null
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-stone-700">
                    {decision === "report-ignored"
                      ? IGNORE_WORDS.ignoredReport
                      : decision === "advance-ignored"
                        ? IGNORE_WORDS.ignoredAdvance
                        : IGNORE_WORDS.bothCounted}
                  </p>
                  {ready && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => onUndo(s)}
                      className="rounded border border-stone-400 bg-white px-2 py-1 disabled:opacity-50"
                    >
                      {IGNORE_WORDS.undo}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-amber-800">{IGNORE_WORDS.hint}</p>
      {message && <p className="font-bold text-stone-800">{message}</p>}
      <p className="text-amber-800">
        ※ 金額はこちらで変えません。数えないことにした記録も消さずに残します。
      </p>
    </div>
  );
}
