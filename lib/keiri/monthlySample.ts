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
 *   ④ 月の表示は**前の月**（まるまる終わった月）。caseStats.ts と同じ数え方を使います
 *      （見本だけ「2026年8月」のまま年を越す、という古びかたを防ぐため）。
 */

import {
  calcCashPosition,
  calcUnpaid,
  mergedExpenseByAccount,
  summarizeMonth,
} from "./aggregate";
import { DISPLAY_EXPENSE_ACCOUNTS } from "./accounts";
import { previousMonthRange } from "./caseStats";
import { DEMO_SHOP_NAME, demoPayments, demoReports, demoSettings } from "./demo";
import { JOURNAL_HEADERS, buildJournalRows } from "./journal";
import { MF_HEADERS } from "./moneyforward";
import { YAYOI_HEADERS } from "./yayoi";
import { GENERIC_TEMPLATE } from "./templates/generic";

/** 見本であることを画面に必ず出す1行（画面に文章を直書きしない） */
export const SAMPLE_NOTICE =
  "これは架空のお店の数字で作った見本です。実在のお店の数字ではありません。";

/** 見出しの下に出す1行。何を・いつ渡すかだけを書く（新しい約束を足さない） */
export const SAMPLE_LEAD =
  "月はじめに、前の月ぶんをこの形でお出しします。お店側の作業はありません。";

/** 要約の1行（見出しと金額） */
export type SampleLine = { label: string; yen: number };

/** 仕訳の1行（人が読む6列ぶん） */
export type SampleJournalLine = {
  date: string;
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  note: string;
};

export type MonthlySample = {
  /** 「2026年8月」 */
  monthLabel: string;
  /** 架空のお店の名前 */
  shopName: string;
  /** 上に大きく出す4つ（売上・利益・今の現金・まだ払っていないお金） */
  headline: SampleLine[];
  /** 経費の内訳（0円の科目は出さない） */
  expenses: SampleLine[];
  /** 会計ソフト用CSVの列の見出し（人が読む6列） */
  journalHeaders: readonly string[];
  /** 会計ソフト用CSVの中身（先頭の数行だけ見せる） */
  journalRows: SampleJournalLine[];
  /** 仕訳が全部で何行あるか（先頭だけ見せていることを正直に書くため） */
  journalRowCount: number;
  /** マネーフォワードの仕訳帳インポートの列数（27列） */
  mfColumnCount: number;
  /** 弥生会計の仕訳インポートの列の数（25） */
  yayoiColumnCount: number;
};

/** 見本に見せる仕訳の行数（スマホで開くので、長くしない） */
export const SAMPLE_JOURNAL_PREVIEW_ROWS = 4;

/**
 * 見本を組み立てる。
 *
 * ★計算はしない。**本物と同じ関数に計算させて、並べ替えるだけ**。
 * @param today いつ時点で「前の月」を数えるか（テストから固定するために受け取る）
 */
export function buildMonthlySample(today: Date = new Date()): MonthlySample {
  const { label: monthLabel, start } = previousMonthRange(today);
  const ym = start.slice(0, 7);

  const settings = demoSettings(ym);
  const reports = demoReports(ym);
  const payments = demoPayments();
  const template = GENERIC_TEMPLATE;

  const summary = summarizeMonth({ ym, reports, template, settings });
  const cash = calcCashPosition({ reports, payments, settings });
  const unpaid = calcUnpaid({ reports, payments, settings, currentYm: ym });

  const merged = mergedExpenseByAccount(summary.expenseByAccount);
  const expenses: SampleLine[] = DISPLAY_EXPENSE_ACCOUNTS.map((a) => ({
    label: a.label,
    yen: merged[a.key] ?? 0,
  })).filter((e) => e.yen > 0);

  const rows = buildJournalRows({ ym, reports, payments, template, settings });

  return {
    monthLabel,
    shopName: DEMO_SHOP_NAME,
    headline: [
      { label: "売上", yen: summary.sales },
      { label: "経費の合計", yen: summary.expenseTotal },
      { label: "今月の利益", yen: summary.profit },
      { label: "今の現金", yen: cash.balance },
      { label: "まだ払っていないお金", yen: unpaid.total },
    ],
    expenses,
    journalHeaders: JOURNAL_HEADERS,
    journalRows: rows.slice(0, SAMPLE_JOURNAL_PREVIEW_ROWS).map((r) => ({
      date: r.date,
      debitAccount: r.debitAccount,
      debitAmount: r.debitAmount,
      creditAccount: r.creditAccount,
      creditAmount: r.creditAmount,
      note: r.note,
    })),
    journalRowCount: rows.length,
    mfColumnCount: MF_HEADERS.length,
    yayoiColumnCount: YAYOI_HEADERS.length,
  };
}

/** 金額の表示（「82,000円」）。マイナスは「−」を頭に付ける */
export function sampleYen(yen: number): string {
  const n = Math.round(yen);
  const abs = Math.abs(n).toLocaleString("ja-JP");
  return n < 0 ? `−${abs}円` : `${abs}円`;
}
