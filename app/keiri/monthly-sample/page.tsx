import Link from "next/link";

import { KeiriBreadcrumb, KeiriFooter } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";
import OneSheetView from "@/app/keiri/components/OneSheetView";
import {
  SAMPLE_LEAD,
  SAMPLE_MONTH_NOTE,
  SAMPLE_NOTICE,
  buildMonthlySample,
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

/**
 * 月が変わったら作り直す（1時間ごと）。
 * ★お試し版（/keiri/demo）と同じ月を出すページなので、
 *   作った時の月で固まると、お試し版と月がずれます（2026-10-03・kp225-b2）。
 */
export const revalidate = 3600;

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

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print">
        <KeiriBreadcrumb items={[{ name: "毎月お届けする1枚（見本）" }]} />
      </div>

      <h1 className="text-2xl font-bold text-stone-900">毎月お届けする1枚（見本）</h1>
      <p className="mt-2 text-sm text-stone-600 leading-relaxed">{SAMPLE_LEAD}</p>
      <p className="mt-1 text-xs text-amber-700 font-bold">{SAMPLE_NOTICE}</p>
      <p className="mt-1 text-xs text-stone-500 leading-relaxed">{SAMPLE_MONTH_NOTE}</p>

      {/* ---------- 1枚の要約 ----------
          ★見た目は app/keiri/components/OneSheetView.tsx の1か所です（2026-10-04・kp231）。
            本物のお店にお渡しする1枚（/keiri/monthly）とまったく同じ部品を使うので、
            「見本では出たのに本物では形が違う」が起きません。 */}
      <OneSheetView sheet={sample} />

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
