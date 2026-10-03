import Link from "next/link";

import { KeiriBreadcrumb, KeiriFooter } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";
import {
  SAMPLE_LEAD,
  SAMPLE_NOTICE,
  buildMonthlySample,
  sampleYen,
} from "@/lib/keiri/monthlySample";

/**
 * 毎月お店に渡す「1枚の要約」の見本（1枚だけのページ・2026-10-03・f5-1）。
 *
 * ■ なぜ1枚だけのページにしたか
 *   見本は /keiri/case（事例と価格）の途中に区画として入っていました。
 *   ところが じゅんが店主の前でスマホで見せるときは、
 *   **価格や事例を通り過ぎずに、渡すものだけを1画面で出したい**。
 *   そのための1枚です。中身は /keiri/case の区画と同じ関数から作ります。
 *
 * ■ 守ること（lib/keiri/monthlySample.ts と同じ）
 *   ① **金額をこの画面に直書きしない。**本物の画面が呼んでいるのと同じ関数
 *      （aggregate.ts / journal.ts）に計算させた数字だけを出す。
 *   ② 出すのは**架空のお店**（デモ食堂）の数字だけ。手羽屋の実際の月次は出さない。
 *   ③ **新しい約束を足さない。**値段も書かない（値段は /keiri/case が唯一の正）。
 *
 * ■ 月の経費が3か所で同じかを、この1枚の上で見せる（f1-2）
 *   月の経費は「立替も含めた全部」の1つが正です（kp218）。
 *   その1つが、画面・科目ごとの内訳・会計ソフト向けCSV の3通りの数え方で
 *   同じ数字になることを、この1枚に出します。
 *   数えているのは lib（journalExpenseTotal など）で、ここでは並べるだけです。
 *
 * ■ 作りの決めごと
 *   ・JavaScript が動かなくても全部読める（折りたたみ・画面送りを使わない）
 *   ・印刷すると紙1枚に収まる（リンクと案内は刷らない）
 *   ・店のデータは一切読まない。誰でも開ける（管理者の鍵は掛けない）
 */

export const metadata = keiriMetadata({
  path: "/keiri/monthly-sample",
  title: "毎月お届けする1枚（見本）｜経理パッケージ",
  description:
    "月はじめにお店へお渡しする「1枚の要約」の見本です。架空のお店の数字を、実際のお店で動いているのと同じ計算で出しています。",
});

/** 紙1枚に収めるための指定だけ（色は付けない） */
const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  .sheet { box-shadow: none !important; border-color: #d6d3d1 !important; }
  @page { size: A4; margin: 12mm; }
}
`;

export default function KeiriMonthlySamplePage() {
  const sample = buildMonthlySample();
  const check = sample.expenseCheck;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print">
        <KeiriBreadcrumb items={[{ name: "毎月お届けする1枚（見本）" }]} />
      </div>

      <h1 className="text-2xl font-bold text-stone-900">毎月お届けする1枚（見本）</h1>
      <p className="mt-2 text-sm text-stone-600 leading-relaxed">{SAMPLE_LEAD}</p>
      <p className="mt-1 text-xs text-amber-700 font-bold">{SAMPLE_NOTICE}</p>

      {/* ---------- 1枚の要約 ---------- */}
      <section className="sheet mt-6 rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-bold text-amber-700">1枚の要約</p>
        <p className="mt-1 text-sm text-stone-500">
          {sample.monthLabel}・{sample.shopName}（日報{sample.reportCount}件から自動で出した数字）
        </p>

        <dl className="mt-3 divide-y divide-stone-100">
          {sample.headline.map((line) => (
            <div key={line.label} className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-sm text-stone-600">{line.label}</dt>
              <dd className="text-lg font-bold text-stone-900 tabular-nums">
                {sampleYen(line.yen)}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-xs font-bold text-stone-500">経費の内訳（科目ごと）</p>
        <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {sample.expenses.map((e) => (
            <li
              key={e.label}
              className="flex items-baseline justify-between gap-3 text-sm text-stone-700"
            >
              <span>{e.label}</span>
              <span className="tabular-nums">{sampleYen(e.yen)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-stone-200 pt-2 text-sm font-bold text-stone-900">
          <span>経費の合計</span>
          <span className="tabular-nums">{sampleYen(sample.expenseTotal)}</span>
        </p>

        <p className="mt-5 text-xs font-bold text-stone-500">
          経費の合計 {sampleYen(sample.expenseTotal)} の内訳（お金の出どころ）
        </p>
        <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {sample.expenseBreakdown.map((e) => (
            <li
              key={e.label}
              className="flex items-baseline justify-between gap-3 text-sm text-stone-700"
            >
              <span>{e.label}</span>
              <span className="tabular-nums">{sampleYen(e.yen)}</span>
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
              <span className="tabular-nums">{sampleYen(check.screen)}</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span>② 科目ごとの内訳を足した額</span>
              <span className="tabular-nums">{sampleYen(check.byAccount)}</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span>③ 会計ソフトに渡すCSV（全{sample.journalRowCount}行）</span>
              <span className="tabular-nums">{sampleYen(check.csv)}</span>
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
          {sample.unmatched.length === 0 ? (
            <p className="mt-1 text-sm text-stone-600">この月はありません。</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-stone-700">
              {sample.unmatched.map((u, i) => (
                <li key={`${u.date}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span>
                    {u.date}　{u.description}
                  </span>
                  <span className="tabular-nums">{sampleYen(u.amount)}</span>
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
            会計ソフトがそのまま読める形（仕訳）のCSV、この月は全{sample.journalRowCount}行。
            マネーフォワード クラウド会計は{sample.mfColumnCount}列、
            弥生会計・やよいの青色申告は{sample.yayoiColumnCount}列の形でお出しします。
            書き出しはこちらで行うので、お店側の作業はありません。
          </p>
          <div className="mt-3 -mx-1 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-xs">
              <thead>
                <tr className="text-stone-500">
                  {sample.journalHeaders.map((h) => (
                    <th key={h} className="px-1 py-1 text-left font-bold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-stone-700">
                {sample.journalRows.map((r, i) => (
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
            はじめの{sample.journalRows.length}行だけを出しています（全{sample.journalRowCount}行）。
          </p>
        </div>
      </section>

      {/* ---------- 次に見るもの（刷らない） ---------- */}
      <section className="no-print mt-8">
        <h2 className="text-lg font-bold text-stone-900">次に見るもの</h2>
        <ul className="mt-3 space-y-3">
          <li>
            <Link
              href="/keiri/demo"
              className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">お試し版（申し込まずに触る）</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                この1枚のもとになった画面を、登録なしでそのまま触れます。日報を1件足すと数字が変わります。
              </p>
            </Link>
          </li>
          <li>
            <Link
              href="/keiri/plan"
              className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">経理まるごと（月5万円前後）の中身</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                この1枚をお届けするプランで、こちらが何をやって何をやらないか。税務の判断はしません。
              </p>
            </Link>
          </li>
          <li>
            <Link
              href="/keiri/case"
              className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">事例と価格</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                実際に使っているお店の数字と、含まれるもの・含まれないもの。
              </p>
            </Link>
          </li>
        </ul>
      </section>

      <div className="no-print mt-10">
        <KeiriFooter />
      </div>
    </main>
  );
}
