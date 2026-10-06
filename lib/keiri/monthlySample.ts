/**
 * 「毎月お届けするもの」の見本（月はじめにお出しする1枚の要約と、会計ソフト用のCSV）。
 *
 * ■ なぜ作ったか（2026-09-20・司令室 kp113）
 *   経理パッケージは月15,000円で、その値段の半分は
 *   「毎月の締めをこちらでやって渡す」（lib/keiri/offer.ts の②）が占めています。
 *   ところが**その渡すものが、どこにも見えていませんでした。**
 *   紹介ページにも、お試し版にも、「CSVと要約をお出しします」と**文章で書いてあるだけ**。
 *   買う側から見ると、月1,000円台の会計ソフトと比べて何が違うのか確かめようがありません。
 *   値段のいちばん重い部分が目に見えない——これが申し込みの手前に残っていた穴です。
 *
 * ■ 守ること（ここを崩さないこと）
 *   ① **数字を書かない。**見本の金額も仕訳も、**本物の画面が呼んでいるのと同じ関数**
 *      （aggregate.ts / journal.ts / moneyforward.ts）にそのまま計算させます。
 *      見本のために数字を書き写すと、それは「こう出ます」という**嘘の約束**になります。
 *      ここが本物と同じ関数を通っているかぎり、見本は出せないものを見せられません。
 *   ② **架空のお店の数字だけを使う**（lib/keiri/demo.ts）。
 *      手羽屋の実際の月次を見本に出すと、事例として許された範囲を超えて
 *      じゅんの店の内訳を公開することになります。お試し版と同じ架空の店で揃えます。
 *   ③ **新しい約束を足さない。**見本に出してよいのは、offer.ts に既に書いてある
 *      「1枚の要約」と「会計ソフトに取り込めるCSV」の中身だけです。
 *   ④ 月の表示は**お試し版（/keiri/demo）と同じ月**＝日本時間の今月にそろえます
 *      （2026-10-03・kp225-b2）。
 *      以前は「前の月」で作っていたため、お試し版が『2026年10月』なのに
 *      この見本だけ『2026年9月』（CSVの日付も 2026-09-03）になり、
 *      お試し版からこの1枚へ進んだ店主が「さっきと数字は同じなのに月がちがう」と
 *      迷う形になっていました（B2 が本番で見つけた）。
 *      どちらの月でも数字は同じ（架空の日報は月をあてはめているだけ）なので、
 *      **迷わせない方＝お試し版と同じ月**にそろえます。
 *      月が自動で進むことは変わらないので、「見本だけ古びる」心配もありません。
 *      実際にお渡しするのは、まるまる終わった前の月ぶんです（下の SAMPLE_MONTH_NOTE）。
 */

import {
  ONE_SHEET_DISCLAIMER,
  SAMPLE_JOURNAL_PREVIEW_ROWS,
  buildOneSheet,
  sheetYen,
  type MonthlySample,
  type SampleExpenseCheck,
  type SampleJournalLine,
  type SampleLine,
} from "./oneSheet";
import {
  DEMO_SHOP_NAME,
  demoAdvances,
  demoPayments,
  demoReports,
  demoSettings,
  demoTodayJst,
} from "./demo";
import { GENERIC_TEMPLATE } from "./templates/generic";

/**
 * ★数字の並べ方は lib/keiri/oneSheet.ts に移しました（2026-10-04・kp231）。
 *   本物のお店にお渡しする1枚（/keiri/monthly）と**まったく同じ関数**を通すためです。
 *   ここに残っているのは「見本のための言葉」と「架空のお店のデータを入れる所」だけです。
 */
export {
  ONE_SHEET_DISCLAIMER,
  SAMPLE_JOURNAL_PREVIEW_ROWS,
  buildOneSheet,
  type MonthlySample,
  type SampleExpenseCheck,
  type SampleJournalLine,
  type SampleLine,
};

/** 見本であることを画面に必ず出す1行（画面に文章を直書きしない） */
export const SAMPLE_NOTICE =
  "これは架空のお店の数字で作った見本です。実在のお店の数字ではありません。";

/** 見出しの下に出す1行。何を・いつ渡すかだけを書く（新しい約束を足さない） */
export const SAMPLE_LEAD =
  "月はじめに、前の月ぶんをこの形でお出しします。お店側の作業はありません。";

/**
 * 見本の月について、誤解させないための1行（2026-10-03・kp225-b2）。
 * 見本の月は お試し版と同じ月にそろえてあるので、
 * 「前の月ぶんをお出しする」という約束との関係をここで書いておく。
 */
export const SAMPLE_MONTH_NOTE =
  "見本の月は、お試し版（触れる画面）と同じ月にそろえてあります。実際にお渡しするのは、まるまる終わった前の月ぶんです。";

/**
 * 見本に出す月。**お試し版（/keiri/demo）と同じ「日本時間の今月」**。
 *
 * ★お試し版が demoTodayJst（日本時間）で月を決めているので、ここも同じ関数を通します。
 *   日本時間を使わないと、月の変わり目に2つのページが別の月を出します
 *   （置いてあるサーバーの時計は日本時間ではありません）。
 */
export function sampleMonth(today: Date = new Date()): { ym: string; label: string } {
  const ym = demoTodayJst(today).slice(0, 7);
  const [y, m] = ym.split("-");
  return { ym, label: `${Number(y)}年${Number(m)}月` };
}

/**
 * 見本を組み立てる。
 *
 * ★計算はしない。**本物にお渡しする1枚と同じ関数**（buildOneSheet）に、
 *   架空のお店のデータを入れるだけ。
 * @param today いつ時点の月で作るか（テストから固定するために受け取る）
 */
export function buildMonthlySample(today: Date = new Date()): MonthlySample {
  const { ym, label: monthLabel } = sampleMonth(today);

  return buildOneSheet({
    ym,
    monthLabel,
    shopName: DEMO_SHOP_NAME,
    reports: demoReports(ym),
    payments: demoPayments(),
    // 立替も見本に入れる（月の経費は立替も含めた全部で1つ。kp218）
    advances: demoAdvances(ym),
    settings: demoSettings(ym),
    template: GENERIC_TEMPLATE,
    // 「◯月◯日に作りました」の日付も、お試し版と同じ日本時間の今日にそろえる
    madeOn: demoTodayJst(today),
  });
}

/** 金額の表示（「82,000円」）。マイナスは「−」を頭に付ける */
export const sampleYen = sheetYen;
