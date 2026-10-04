/**
 * 「1枚の要約」の見た目。架空のお店の見本（/keiri/monthly-sample）と
 * 本物のお店にお渡しする1枚（/keiri/monthly）が、**この1つの部品**を使います。
 *
 * ■ なぜ1つにしたか（2026-10-04・kp231）
 *   見本と本物で見た目を別に作ると、見本で見せた形と
 *   実際にお渡しする紙が別物になります（見本が嘘になる）。
 *   数字の出し方は lib/keiri/oneSheet.ts、見た目はここ。どちらも1か所です。
 *
 * ■ 守ること
 *   ・金額をここに直書きしない（渡されたものを並べるだけ）。
 *   ・JavaScript が動かなくても全部読める（折りたたみ・画面送りを使わない）。
 *   ・印刷すると紙1枚（刷らないものは no-print を付ける）。
 */

import type { MonthlySample } from "@/lib/keiri/oneSheet";
import { sheetYen } from "@/lib/keiri/oneSheet";

export default function OneSheetView({ sheet }: { sheet: MonthlySample }) {
  const check = sheet.expenseCheck;

  return (
    <section className="sheet mt-6 rounded-2xl border border-stone-200 bg-white p-5">
      <p className="text-xs font-bold text-amber-700">1枚の要約</p>
      <p className="mt-1 text-sm text-stone-500">
        {sheet.monthLabel}
        {sheet.shopName ? `・${sheet.shopName}` : ""}（日報{sheet.reportCount}件から自動で出した数字）
      </p>

      <dl className="mt-3 divide-y divide-stone-100">
        {sheet.headline.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-sm text-stone-600">{line.label}</dt>
            <dd className="text-lg font-bold text-stone-900 tabular-nums">
              {sheetYen(line.yen)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-xs font-bold text-stone-500">経費の内訳（科目ごと）</p>
      <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {sheet.expenses.map((e) => (
          <li
            key={e.label}
            className="flex items-baseline justify-between gap-3 text-sm text-stone-700"
          >
            <span>{e.label}</span>
            <span className="tabular-nums">{sheetYen(e.yen)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-stone-200 pt-2 text-sm font-bold text-stone-900">
        <span>経費の合計</span>
        <span className="tabular-nums">{sheetYen(sheet.expenseTotal)}</span>
      </p>

      <p className="mt-5 text-xs font-bold text-stone-500">
        経費の合計 {sheetYen(sheet.expenseTotal)} の内訳（お金の出どころ）
      </p>
      <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {sheet.expenseBreakdown.map((e) => (
          <li
            key={e.label}
            className="flex items-baseline justify-between gap-3 text-sm text-stone-700"
          >
            <span>{e.label}</span>
            <span className="tabular-nums">{sheetYen(e.yen)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-stone-500 leading-relaxed">
        月の経費は<strong>立替も含めた全部</strong>で1つに決めています。立て替えた日には
        まだ金庫からお金が出ていないので、返すまでは「まだ払っていないお金」に出ます。
      </p>

      {/* ---------- 月の経費が3か所で同じことを見せる ---------- */}
      <div className="mt-5 rounded-xl bg-stone-50 p-4">
        <p className="text-xs font-bold text-stone-700">
          月の経費は、この3か所で同じ数字です
        </p>
        <ul className="mt-2 space-y-1 text-sm text-stone-700">
          <li className="flex items-baseline justify-between gap-3">
            <span>① 画面（今月の利益のもと）</span>
            <span className="tabular-nums">{sheetYen(check.screen)}</span>
          </li>
          <li className="flex items-baseline justify-between gap-3">
            <span>② 科目ごとの内訳を足した額</span>
            <span className="tabular-nums">{sheetYen(check.byAccount)}</span>
          </li>
          <li className="flex items-baseline justify-between gap-3">
            <span>③ 会計ソフトに渡すCSV（全{sheet.journalRowCount}行）</span>
            <span className="tabular-nums">{sheetYen(check.csv)}</span>
          </li>
        </ul>
        <p className="mt-2 text-xs font-bold text-stone-700">
          {check.same
            ? "→ 3つとも同じ数字です（1円の違いもありません）。"
            : "→ 3つの数字が合っていません。数え方のどこかがずれています。"}
        </p>
      </div>

      {/* ---------- 要確認（隠さない） ---------- */}
      <div className="mt-4">
        <p className="text-xs font-bold text-stone-500">要確認（種類が分からなかった経費）</p>
        {sheet.unmatched.length === 0 ? (
          <p className="mt-1 text-sm text-stone-600">この月はありません。</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm text-stone-700">
            {sheet.unmatched.map((u, i) => (
              <li key={`${u.date}-${i}`} className="flex items-baseline justify-between gap-3">
                <span>
                  {u.date}　{u.description}
                </span>
                <span className="tabular-nums">{sheetYen(u.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-stone-500 leading-relaxed">
          言葉から種類が決められなかった経費は「雑費」に置き、この欄に出します。
          勝手に決めずに、こちらで中身を確かめてから直します。
        </p>
      </div>

      {/* ---------- CSV ---------- */}
      <div className="mt-5 border-t border-stone-200 pt-4">
        <p className="text-xs font-bold text-amber-700">一緒にお渡しするもの</p>
        <p className="mt-1 text-sm text-stone-700 leading-relaxed">
          会計ソフトがそのまま読める形（仕訳）のCSV、この月は全{sheet.journalRowCount}行。
          マネーフォワード クラウド会計は{sheet.mfColumnCount}列、
          弥生会計・やよいの青色申告は{sheet.yayoiColumnCount}列の形でお出しします。
          書き出しはこちらで行うので、お店側の作業はありません。
        </p>
        <div className="mt-3 -mx-1 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-xs">
            <thead>
              <tr className="text-stone-500">
                {sheet.journalHeaders.map((h) => (
                  <th key={h} className="px-1 py-1 text-left font-bold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-stone-700">
              {sheet.journalRows.map((r, i) => (
                <tr key={`${r.date}-${i}`} className="border-t border-stone-100">
                  <td className="px-1 py-1 whitespace-nowrap">{r.date}</td>
                  <td className="px-1 py-1 whitespace-nowrap">{r.debitAccount}</td>
                  <td className="px-1 py-1 whitespace-nowrap tabular-nums">
                    {r.debitAmount.toLocaleString("ja-JP")}
                  </td>
                  <td className="px-1 py-1 whitespace-nowrap">{r.creditAccount}</td>
                  <td className="px-1 py-1 whitespace-nowrap tabular-nums">
                    {r.creditAmount.toLocaleString("ja-JP")}
                  </td>
                  <td className="px-1 py-1">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          はじめの{sheet.journalRows.length}行だけを出しています（全{sheet.journalRowCount}行）。
        </p>
      </div>
    </section>
  );
}
