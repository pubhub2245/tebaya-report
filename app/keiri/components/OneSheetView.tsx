/**
 * 「1枚の要約」の見た目。架空のお店の見本（/keiri/monthly-sample）と
 * 本物のお店にお渡しする1枚（/keiri/monthly）が、**この1つの部品**を使います。
 *
 * ■ なぜ1つにしたか（2026-10-04・kp231）
 *   見本と本物で見た目を別に作ると、見本で見せた形と
 *   実際にお渡しする紙が別物になります（見本が嘘になる）。
 *   数字の出し方は lib/keiri/oneSheet.ts、見た目はここ。どちらも1か所です。
 *
 * ■ 言葉と並び順は B2 の見本どおり（2026-10-04・kp231 ②）
 *   ①見出し ②大きな数字3つ（売上・かかったお金・残ったお金）＋式
 *   ③かかったお金の中身 ④いま手元にある現金 ⑤まだ払っていないお金
 *   ⑥確かめてほしいこと（無い月は枠ごと出さない）⑦会計ソフトに渡す表
 *   ⑦b 試算表（たたんである。税理士さんと会計ソフトが最初に見る表・f1-7）⑧断り書き
 *   店主が読む紙なので「経費」「利益」「未払金」「仕訳」は出しません。
 *
 * ■ 守ること
 *   ・金額をここに直書きしない（渡されたものを並べるだけ）。
 *   ・**どのお店の日報を数えたか（scopeLabel）を必ず出す**（kp234・f1-5）。
 *     件数だけでは、手羽屋ともも屋が混ざっていても気づけません。
 *   ・**検算が合わないときは1枚を出さない**（合わない所だけを出す）。
 *   ・JavaScript が動かなくても全部読める（折りたたみ・画面送りを使わない）。
 *   ・印刷すると紙1枚（刷らないものは no-print を付ける）。
 */

import type { MonthlySample } from "@/lib/keiri/oneSheet";
import { ONE_SHEET_DISCLAIMER, sheetDayLabel, sheetYen } from "@/lib/keiri/oneSheet";

export default function OneSheetView({ sheet }: { sheet: MonthlySample }) {
  const check = sheet.expenseCheck;
  const review = sheet.review;

  // ★検算が合っていない月は、1枚を出さずに「合っていない所」を出す。
  //   数字の合っていない紙をお店にお渡しするほうが、出さないより悪いためです。
  if (!sheet.verify.ok) {
    return (
      <section className="sheet mt-6 rounded-2xl border border-red-300 bg-red-50 p-5">
        <p className="text-xs font-bold text-red-700">この月の1枚は出せません</p>
        <p className="mt-2 text-sm text-red-800 leading-relaxed">
          出す前の検算が合いませんでした。数字の合っていない1枚はお渡ししません。
          下の所を直すと出せるようになります。
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-800">
          {sheet.verify.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="sheet mt-6 rounded-2xl border border-stone-200 bg-white p-5">
      {/* ---------- ① 見出し ---------- */}
      <h2 className="text-lg font-bold text-stone-900">{sheet.title}</h2>
      <p className="mt-1 text-xs text-stone-500">{sheet.madeOnLabel}</p>
      {/* ★どのお店の日報を数えたか（kp234・f1-5）。件数だけでは分からないので必ず出す */}
      <p className="mt-1 text-xs text-stone-600">{sheet.scopeLabel}</p>
      {sheet.scopeNotes.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 rounded-lg bg-amber-50 px-5 py-3 text-xs text-amber-900 leading-relaxed">
          {sheet.scopeNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {/* ---------- ② 大きな数字3つ ---------- */}
      <dl className="mt-4 divide-y divide-stone-100">
        {sheet.headline.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-sm text-stone-600">{line.label}</dt>
            <dd className="text-xl font-bold text-stone-900 tabular-nums">
              {sheetYen(line.yen)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-stone-500 tabular-nums">{sheet.profitLine}</p>

      {/* ---------- ③ かかったお金の中身 ---------- */}
      <p className="mt-5 text-xs font-bold text-stone-500">かかったお金の中身</p>
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
        <span>合計</span>
        <span className="tabular-nums">{sheetYen(sheet.expenseTotal)}</span>
      </p>

      <p className="mt-4 text-xs font-bold text-stone-500">
        かかったお金 {sheetYen(sheet.expenseTotal)} の出どころ
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
        かかったお金は<strong>立て替えてもらった分も含めた全部</strong>で1つに決めています。
        立て替えた日にはまだ金庫からお金が出ていないので、返すまでは
        「まだ払っていないお金」に出ます。
      </p>

      {/* ---------- ④ いま手元にある現金 ---------- */}
      <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-stone-200 pt-4">
        <p className="text-sm font-bold text-stone-700">いま手元にある現金</p>
        <p className="text-lg font-bold text-stone-900 tabular-nums">
          {sheetYen(sheet.cash.balance)}
        </p>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        {sheetDayLabel(sheet.cash.countedOn)}に数えた {sheetYen(sheet.cash.countedYen)}{" "}
        から計算しています。
      </p>

      {/* ---------- ⑤ まだ払っていないお金 ---------- */}
      <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-stone-200 pt-4">
        <p className="text-sm font-bold text-stone-700">まだ払っていないお金</p>
        <p className="text-lg font-bold text-stone-900 tabular-nums">
          {sheetYen(sheet.unpaid.total)}
        </p>
      </div>
      {sheet.unpaid.lines.length === 0 ? (
        <p className="mt-1 text-sm text-stone-600">この月はありません。</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {sheet.unpaid.lines.map((l) => (
            <li
              key={l.label}
              className="flex items-baseline justify-between gap-3 text-sm text-stone-700"
            >
              <span>{l.label}</span>
              <span className="tabular-nums">{sheetYen(l.yen)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- ⑥ 確かめてほしいこと（無い月は枠ごと出さない） ---------- */}
      {review.any && (
        <div className="mt-5 rounded-xl bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-800">確かめてほしいこと</p>

          {review.unmatched.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-bold text-stone-800">
                種類が分からず「雑費」に入れたもの：{review.unmatched.length}件
              </p>
              <ul className="mt-1 space-y-1 text-sm text-stone-700">
                {review.unmatched.map((u, i) => (
                  <li
                    key={`${u.date}-${i}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span>
                      {u.date}　{u.description}
                    </span>
                    <span className="tabular-nums">{sheetYen(u.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-stone-500 leading-relaxed">
                言葉から種類が決められなかったものは「雑費」に置いて、ここに出します。
                勝手に決めずに、こちらで中身を確かめてから直します。
              </p>
            </div>
          )}

          {review.duplicate && (
            <div className="mt-3">
              <p className="text-sm font-bold text-stone-800">
                同じ支払いが2か所に書かれているかもしれないもの：{review.duplicate.count}件・
                {sheetYen(review.duplicate.sameMonthYen)}
              </p>
              {review.duplicate.sameMonthYen > 0 && (
                <p className="mt-1 text-sm text-stone-700 leading-relaxed tabular-nums">
                  片方を消すと、かかったお金が {sheetYen(review.duplicate.sameMonthYen)} 減り、
                  残ったお金が {sheetYen(review.duplicate.sameMonthYen)} 増えます（かかったお金{" "}
                  {sheetYen(review.duplicate.expenseAfter)}・残ったお金{" "}
                  {sheetYen(review.duplicate.profitAfter)} になります）。
                </p>
              )}
              {review.duplicate.crossMonthYen > 0 && (
                <p className="mt-1 text-sm text-stone-700 leading-relaxed">
                  月をまたいで書かれているかもしれないもの：
                  {sheetYen(review.duplicate.crossMonthYen)}
                  （どちらの月に入れるかで動きます）
                </p>
              )}
              <p className="mt-1 text-xs text-stone-500 leading-relaxed">
                どちらを消すかはこちらでは決めません。金額は直さずに、そのまま出しています。
              </p>
            </div>
          )}

          {review.noReceiptCount !== null && review.noReceiptCount > 0 && (
            <p className="mt-3 text-sm font-bold text-stone-800">
              レシートの写真が無い支払い：{review.noReceiptCount}件
            </p>
          )}
        </div>
      )}

      {/* ---------- 月の経費が3か所で同じことを見せる ---------- */}
      <div className="mt-5 rounded-xl bg-stone-50 p-4">
        <p className="text-xs font-bold text-stone-700">
          かかったお金は、この3か所で同じ数字です
        </p>
        <ul className="mt-2 space-y-1 text-sm text-stone-700">
          <li className="flex items-baseline justify-between gap-3">
            <span>① 画面（残ったお金のもと）</span>
            <span className="tabular-nums">{sheetYen(check.screen)}</span>
          </li>
          <li className="flex items-baseline justify-between gap-3">
            <span>② 中身（種類ごと）を足した額</span>
            <span className="tabular-nums">{sheetYen(check.byAccount)}</span>
          </li>
          <li className="flex items-baseline justify-between gap-3">
            <span>③ 会計ソフトに渡す表（全{sheet.journalRowCount}行）</span>
            <span className="tabular-nums">{sheetYen(check.csv)}</span>
          </li>
        </ul>
        <p className="mt-2 text-xs font-bold text-stone-700">
          → 3つとも同じ数字です（1円の違いもありません）。
        </p>
      </div>

      {/* ---------- ⑦ 会計ソフトに渡す表 ---------- */}
      <div className="mt-5 border-t border-stone-200 pt-4">
        <p className="text-xs font-bold text-amber-700">会計ソフトに渡す表</p>
        <p className="mt-1 text-sm text-stone-700 leading-relaxed">
          この月は全{sheet.journalRowCount}行。経理の画面のボタンで受け取れます。
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

      {/* ---------- ⑦b 試算表（税理士さん・会計ソフト用） ---------- */}
      <details className="mt-5 border-t border-stone-200 pt-4">
        <summary className="cursor-pointer text-xs font-bold text-amber-700">
          試算表（税理士さんと会計ソフトが最初に見る表）
          <span className="ml-2 font-normal text-stone-500">
            左の合計 {sheetYen(sheet.trial.debitTotal)}／右の合計{" "}
            {sheetYen(sheet.trial.creditTotal)}
            {sheet.trial.balanced ? "・ぴったり合っています" : "・合っていません"}
          </span>
        </summary>
        <p className="mt-2 text-sm text-stone-700 leading-relaxed">
          科目ごとに「左（借方）にいくら・右（貸方）にいくら」を足し上げた表です。
          左と右の合計がぴったり同じなら、帳簿の形が崩れていないしるしです。
          お店側の作業はありません（全{sheet.trial.rowCount}行の仕訳から自動で作っています）。
        </p>
        <div className="mt-3 -mx-1 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-xs">
            <thead>
              <tr className="text-stone-500">
                <th className="px-1 py-1 text-left font-bold whitespace-nowrap">科目</th>
                <th className="px-1 py-1 text-right font-bold whitespace-nowrap">借方合計</th>
                <th className="px-1 py-1 text-right font-bold whitespace-nowrap">貸方合計</th>
                <th className="px-1 py-1 text-right font-bold whitespace-nowrap">残高</th>
              </tr>
            </thead>
            <tbody className="text-stone-700">
              {sheet.trial.lines.map((l) => (
                <tr key={l.account} className="border-t border-stone-100">
                  <td className="px-1 py-1 whitespace-nowrap">{l.account}</td>
                  <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                    {l.debit.toLocaleString("ja-JP")}
                  </td>
                  <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                    {l.credit.toLocaleString("ja-JP")}
                  </td>
                  <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                    {l.balanceAbs.toLocaleString("ja-JP")}
                    {l.side !== "なし" && (
                      <span className="ml-1 text-stone-400">{l.side}</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-300 font-bold">
                <td className="px-1 py-1 whitespace-nowrap">合計</td>
                <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                  {sheet.trial.debitTotal.toLocaleString("ja-JP")}
                </td>
                <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                  {sheet.trial.creditTotal.toLocaleString("ja-JP")}
                </td>
                <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">0</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs font-bold text-stone-700">
          → 試算表の売上 {sheetYen(sheet.trial.revenueTotal)} − かかったお金{" "}
          {sheetYen(sheet.trial.expenseTotal)} ＝ {sheetYen(sheet.trial.profit)}
          {sheet.trialCheck.ok
            ? "（この1枚の上の数字と1円まで同じです）"
            : "（この1枚の上の数字と合っていません）"}
        </p>
        {/* 現金が画面の額とちがって見える所の説明（kp243・B2 の材料のまま） */}
        {sheet.trialCashNote && (
          <p className="mt-1 text-xs text-stone-600 leading-relaxed">
            {sheet.trialCashNote}
          </p>
        )}
      </details>

      {/* ---------- ⑧ 断り書き ---------- */}
      <p className="mt-5 border-t border-stone-200 pt-3 text-xs text-stone-500 leading-relaxed">
        {ONE_SHEET_DISCLAIMER}
      </p>
    </section>
  );
}
