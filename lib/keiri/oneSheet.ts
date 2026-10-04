/**
 * 「1枚の要約」を組み立てるところ（架空のお店でも、本物のお店でも、ここ1つを通る）。
 *
 * ■ なぜ分けたか（2026-10-04・kp231）
 *   1枚の要約は **見本（架空のお店／lib/keiri/monthlySample.ts）だけ** にありました。
 *   実際のお店に毎月お渡しする1枚は、どこからも出せませんでした
 *   （経理画面には数字とCSVはあるが、そのまま渡せる1枚が無い）。
 *   かといって本物用にもう1つ作ると、**同じ1枚が2通りに育って数字がずれます**。
 *   そこで「数字の並べ方」をこのファイル1つに寄せ、
 *   見本は架空のお店のデータを、本物の1枚（/keiri/monthly）は倉庫から読んだデータを
 *   **同じ関数に入れるだけ**にしました。
 *
 * ■ 守ること（ここを崩さないこと）
 *   ① **金額を書かない。** 画面が呼んでいるのと同じ関数
 *      （aggregate.ts / journal.ts）に計算させ、ここでは並べるだけ。
 *   ② 月の経費の正しい合計は summarizeMonth の1つだけ（kp218）。
 *      3通りに数え直すのは「同じ数字か」を1枚の上で見せるためだけ（f1-2）。
 *   ③ 要確認（種類が分からなかった経費）は隠さない。
 */

import {
  calcCashPosition,
  calcUnpaid,
  mergedExpenseByAccount,
  summarizeMonth,
} from "./aggregate";
import { DISPLAY_EXPENSE_ACCOUNTS } from "./accounts";
import { JOURNAL_HEADERS, buildJournalRows, journalExpenseTotal } from "./journal";
import { MF_HEADERS } from "./moneyforward";
import { YAYOI_HEADERS } from "./yayoi";
import type {
  BusinessTemplate,
  KeiriAdvance,
  KeiriPayment,
  KeiriReport,
  KeiriSettings,
} from "./types";

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

/** 月の経費を、別々の数え方で3通り数えた結果（同じ数字になるのが正しい） */
export type SampleExpenseCheck = {
  /** 画面（月次のまとめ）が出す合計 */
  screen: number;
  /** 科目ごとの内訳を足し上げた合計 */
  byAccount: number;
  /** 会計ソフト向けCSV（仕訳）の経費側を足し上げた合計 */
  csv: number;
  /** 3つとも同じ数字か */
  same: boolean;
};

export type MonthlySample = {
  /** 「2026年8月」 */
  monthLabel: string;
  /** お店の名前（見本は架空のお店の名前） */
  shopName: string;
  /** 上に大きく出す数字（売上・経費の合計・利益・今の現金・まだ払っていないお金） */
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
  /** 月の経費の合計（これが正。画面・CSV・要約はこの1つを見る） */
  expenseTotal: number;
  /** 経費の合計の内訳（レジのお金から出た分・誰かが立て替えた分・人件費・家賃） */
  expenseBreakdown: SampleLine[];
  /** 月の経費を3通りに数えて突き合わせた結果（f1-2 を外から確かめられるようにする） */
  expenseCheck: SampleExpenseCheck;
  /** 種類が分からず「雑費」に入れた経費（要確認。黙って隠さない） */
  unmatched: { date: string; description: string; amount: number }[];
  /** 集計に使った日報の件数 */
  reportCount: number;
};

/** 見本に見せる仕訳の行数（スマホで開くので、長くしない） */
export const SAMPLE_JOURNAL_PREVIEW_ROWS = 4;

/** 1枚の要約を作るのに必要なもの（倉庫から読んだものでも、架空のお店のものでも同じ形） */
export type OneSheetInput = {
  /** どの月か（YYYY-MM） */
  ym: string;
  /** 画面に出す月の呼び名（「2026年9月」） */
  monthLabel: string;
  /** お店の名前 */
  shopName: string;
  reports: KeiriReport[];
  payments: KeiriPayment[];
  advances: KeiriAdvance[];
  settings: KeiriSettings;
  template: BusinessTemplate;
  /**
   * 「まだ払っていないお金」を数える基準の月（YYYY-MM）。
   * 家賃は「その月まで」を数えるので、ふだんは今日の月を渡す。
   * 省略すると ym（見本は月をあてはめているだけなので ym でよい）。
   */
  currentYm?: string;
  /** 仕訳を何行だけ見せるか */
  previewRows?: number;
};

/**
 * 1枚の要約を組み立てる。
 *
 * ★計算はしない。**本物と同じ関数に計算させて、並べ替えるだけ**。
 */
export function buildOneSheet(input: OneSheetInput): MonthlySample {
  const {
    ym,
    monthLabel,
    shopName,
    reports,
    payments,
    advances,
    settings,
    template,
    currentYm = ym,
    previewRows = SAMPLE_JOURNAL_PREVIEW_ROWS,
  } = input;

  const summary = summarizeMonth({ ym, reports, template, settings, advances });
  const cash = calcCashPosition({ reports, payments, settings, advances });
  const unpaid = calcUnpaid({ reports, payments, settings, currentYm, advances });

  const merged = mergedExpenseByAccount(summary.expenseByAccount);
  const expenses: SampleLine[] = DISPLAY_EXPENSE_ACCOUNTS.map((a) => ({
    label: a.label,
    yen: merged[a.key] ?? 0,
  })).filter((e) => e.yen > 0);

  const rows = buildJournalRows({ ym, reports, payments, template, settings, advances });

  // ★月の経費を、別々の道で3通り数える（f1-2）。
  //   ここで数え直すのは「同じ数字になっているか」をページの上で見せるためで、
  //   正しい合計は summary.expenseTotal の1つだけです（kp218）。
  const byAccountTotal = DISPLAY_EXPENSE_ACCOUNTS.reduce(
    (sum, a) => sum + (merged[a.key] ?? 0),
    0,
  );
  const csvTotal = journalExpenseTotal(rows);

  return {
    monthLabel,
    shopName,
    headline: [
      { label: "売上", yen: summary.sales },
      { label: "経費の合計", yen: summary.expenseTotal },
      { label: "今月の利益", yen: summary.profit },
      { label: "今の現金", yen: cash.balance },
      { label: "まだ払っていないお金", yen: unpaid.total },
    ],
    expenses,
    journalHeaders: JOURNAL_HEADERS,
    journalRows: rows.slice(0, previewRows).map((r) => ({
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
    expenseTotal: summary.expenseTotal,
    expenseBreakdown: [
      { label: "レジのお金から出た分", yen: summary.expenseFromRegister },
      { label: "誰かが立て替えた分", yen: summary.expenseFromAdvance },
      { label: "人件費（日当）", yen: summary.payroll },
      { label: "家賃（事務所）", yen: summary.rent },
      { label: "外注費", yen: summary.outsourcing },
    ].filter((e) => e.yen > 0),
    expenseCheck: {
      screen: summary.expenseTotal,
      byAccount: byAccountTotal,
      csv: csvTotal,
      same: summary.expenseTotal === byAccountTotal && summary.expenseTotal === csvTotal,
    },
    unmatched: summary.unmatched.map((u) => ({
      date: u.date,
      description: u.description,
      amount: u.amount,
    })),
    reportCount: summary.reportCount,
  };
}

/** 金額の表示（「82,000円」）。マイナスは「−」を頭に付ける */
export function sheetYen(yen: number): string {
  const n = Math.round(yen);
  const abs = Math.abs(n).toLocaleString("ja-JP");
  return n < 0 ? `−${abs}円` : `${abs}円`;
}
