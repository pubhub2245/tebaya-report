"use client";

/**
 * 「同じ日報が2枚 入っている疑い」を、押して片付ける所（2026-11-03・kp246・f1-5）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   10月の手羽屋の記録には、まったく同じ中身の日報が2枚ずつ入っている日が2日あります
 *   （10/11・10/12。どちらも 10/13 に12分あけて入れ直されたもの）。
 *   両方そのまま数えると、その月の売上が 45,050円・かかったお金が 10,317円 多く出ます。
 *   2026-11-03 から疑いは出していましたが、**片付ける道が無く**、
 *   毎月 同じ疑いを見続けることになっていました。
 *
 * ■ ここでやること
 *   1組ごとに2つのうちどちらかを押して決めます。
 *   ・［同じ中身なので1枚だけ数える］ ・［2枚とも本物（両方 数える）］
 *   **日報は消えません。** 決めたあとは「数えていません」と出して、元に戻せます。
 *
 * ■ 書くのはここではありません
 *   押したときに何をするかは、呼んだ側（経理画面）が決めます。
 *
 * ■ 言葉は lib/keiri/reportDups.ts の SAME_REPORT_WORDS だけが持ちます（2か所に書かない）
 */

import type { DuplicateReportGroup } from "@/lib/keiri/duplicates";
import type { IgnoreStore } from "@/lib/keiri/expenseIgnoreMemo";
import {
  SAME_REPORT_WORDS,
  canChooseReportDup,
  reportDupDecision,
  reportDupGroupKey,
  type ReportDupChoice,
  type ReportDupMarks,
} from "@/lib/keiri/reportDups";

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

export default function SameReportChoices({
  groups,
  marks,
  store,
  busy,
  message,
  onChoose,
  onUndo,
}: {
  /** 疑いの組（決めたものも渡してよい。決めた組は「決まっています」と出る） */
  groups: DuplicateReportGroup[];
  marks: ReportDupMarks;
  /**
   * 決めた内容をどこに残せるか。
   *   shelf … 置き場に残す ／ memo … 経理の設定のひとこと欄に控える ／ none … 残せない
   */
  store: IgnoreStore;
  /** いま書き込み中の組（二度押しを防ぐため） */
  busy?: string | null;
  message?: string | null;
  onChoose: (group: DuplicateReportGroup, choice: ReportDupChoice) => void;
  onUndo: (group: DuplicateReportGroup) => void;
}) {
  if (groups.length === 0) {
    return <p className="text-xs text-stone-500">{SAME_REPORT_WORDS.allClear}</p>;
  }

  const pending = groups.filter((g) => reportDupDecision(g, marks) === "pending");
  const ready = store !== "none";

  return (
    <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 space-y-3">
      <p className="font-bold">
        {pending.length > 0
          ? `同じ日報が2枚 入っているかもしれません（${pending.length}組・余分な行 ${pending.reduce(
              (t, g) => t + (g.count - 1),
              0,
            )}件）`
          : "同じ日報の疑いは、ぜんぶ片付いています"}
      </p>
      {pending.length > 0 && <p className="leading-relaxed">{SAME_REPORT_WORDS.lead}</p>}

      {store === "none" && (
        <p className="rounded bg-white/70 px-2 py-1 leading-relaxed text-amber-800">
          {SAME_REPORT_WORDS.notReady}
        </p>
      )}
      {store === "memo" && (
        <p className="rounded bg-white/70 px-2 py-1 leading-relaxed text-amber-800">
          {SAME_REPORT_WORDS.memoKeep}
        </p>
      )}

      <ul className="space-y-3">
        {groups.map((g) => {
          const key = reportDupGroupKey(g);
          const decision = reportDupDecision(g, marks);
          const working = busy === key;
          return (
            <li key={key} className="rounded border border-amber-200 bg-white/80 p-2 space-y-2">
              <p className="tabular-nums">
                <span className="font-bold">{g.date}</span>
                {g.unit ? `　${g.unit}号車` : ""}
                {g.location ? `　${g.location}` : ""}
                {g.staff ? `　${g.staff}` : ""}
                {g.shop ? `（${g.shop}）` : ""}
                　売上 {yen(g.sales)}・かかったお金 {yen(g.expenseTotal)} × {g.count}枚
              </p>

              {decision === "pending" ? (
                ready && canChooseReportDup(g) ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => onChoose(g, "count-once")}
                      className="rounded border border-amber-500 bg-white px-2 py-1 font-bold text-amber-900 disabled:opacity-50"
                    >
                      {SAME_REPORT_WORDS.countOnce}
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => onChoose(g, "both")}
                      className="rounded border border-stone-400 bg-white px-2 py-1 text-stone-700 disabled:opacity-50"
                    >
                      {SAME_REPORT_WORDS.both}
                    </button>
                  </div>
                ) : (
                  <p className="text-amber-800">
                    {ready
                      ? "この組は日報の番号が読めないので、ここでは決められません。"
                      : SAME_REPORT_WORDS.notReady}
                  </p>
                )
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">
                    {decision === "count-once"
                      ? SAME_REPORT_WORDS.countedOnce
                      : SAME_REPORT_WORDS.bothCounted}
                  </span>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => onUndo(g)}
                    className="rounded border border-stone-400 bg-white px-2 py-0.5 text-stone-700 disabled:opacity-50"
                  >
                    {SAME_REPORT_WORDS.undo}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="leading-relaxed text-amber-800">{SAME_REPORT_WORDS.hint}</p>
      {message && <p className="font-bold">{message}</p>}
    </div>
  );
}
