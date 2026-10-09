/**
 * 「同じ支払いが2か所にある疑いを、押して片付けられる」ことを、
 * **架空のお店の数字で外から確かめる**ための筋書き（kp230・f1-5）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   片付ける仕組みそのものは入りましたが、確かめるには
 *   ・本物の経理画面（/keiri）… 合言葉が要るので、検査役は開けません
 *   ・お試し版（/keiri/demo）… 架空のお店の数字を変えたくないので、疑いを置いていません
 *   のどちらも使えません。＝ **外からは「入った」と言うしかない**状態でした。
 *
 * ■ そこでやること
 *   架空のお店の日報1枚と立替1件（**同じ日・同じ金額・同じ言葉**）を作り、
 *   **本物と同じ関数**（summarizeMonth・buildOneSheet）に、
 *   ① 何も決めていないとき ② 日報のほうだけ数えるとき
 *   ③ 立て替えのほうだけ数えるとき ④ 別々の支払いとして両方数えるとき
 *   の4通りを計算させて、金額と検算の結果を並べます。
 *
 * ★倉庫には1行も書き込みません（棚が無くても動きます）。
 * ★出る金額はすべて架空のお店のもので、手羽屋の実データは1円も入りません。
 */

import { summarizeMonth } from "./aggregate";
import { findDuplicateExpenses } from "./duplicates";
import {
  readIgnoreMarks,
  writesForChoice,
  type IgnoreChoice,
} from "./expenseIgnores";
import { buildOneSheet } from "./oneSheet";
import { templateFor } from "./index";
import type { KeiriAdvance, KeiriReport, KeiriSettings } from "./types";

/** 架空のお店の名前（実在のお店ではありません） */
export const DUP_SHOP_NAME = "サンプル食堂";

const YM = "2026-09";
const MONTH_LABEL = "2026年9月";
const AMOUNT = 18000;

export const DUP_SETTINGS: KeiriSettings = {
  opening_date: "2026-09-01",
  opening_balance: 0,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "2030-01",
};

/** 架空の日報1枚（売上 50,000円・経費 18,000円 1行） */
export function dupReports(): KeiriReport[] {
  return [
    {
      id: 900001,
      date: "2026-09-12",
      location: "サンプル広場",
      staff_name: "サンプル太郎",
      sales_amount: 50000,
      labor: 0,
      expenses: [{ description: "肉 仕入れ", amount: AMOUNT }],
    },
  ];
}

/** 同じ支払いが立替にも入っている（＝疑いの1組ができる） */
export function dupAdvances(): KeiriAdvance[] {
  return [
    {
      id: 900002,
      date: "2026-09-12",
      amount: AMOUNT,
      description: "肉 仕入れ",
      payer: "サンプル太郎",
      source: "owner",
    },
  ];
}

export type DupCase = {
  /** どうしたとき（人が読む言葉） */
  choice: string;
  /** かかったお金（月の経費の合計） */
  expenseYen: number;
  /** 残ったお金（利益） */
  profitYen: number;
  /** 同じ支払いなので数えなかった額 */
  notCountedYen: number;
  /** 画面・会計ソフト向けCSV・科目ごと の3通りが1円まで一致したか */
  threeWaysAgree: boolean;
  /** 1枚の要約が出せたか（検算が合ったか） */
  sheetReady: boolean;
  /** 「確かめてほしいこと」に残った疑いの件数 */
  suspectsLeft: number;
};

const LABEL: Record<"none" | IgnoreChoice, string> = {
  none: "まだ決めていない（両方そのまま数える）",
  "count-report": "日報のほうだけ数える",
  "count-advance": "立て替えのほうだけ数える",
  both: "別々の支払いなので、両方数える",
};

function caseFor(which: "none" | IgnoreChoice): DupCase {
  const reports = dupReports();
  const advances = dupAdvances();
  const template = templateFor("generic");
  const found = findDuplicateExpenses({ ym: YM, reports, advances });
  const rows =
    which === "none"
      ? []
      : found.suspects.length > 0
        ? writesForChoice(found.suspects[0], which, new Date("2026-10-09T00:00:00.000Z"))
        : [];
  const ignoreMarks = readIgnoreMarks(rows);
  const summary = summarizeMonth({
    ym: YM,
    reports,
    template,
    settings: DUP_SETTINGS,
    advances,
    ignoreMarks,
  });
  const sheet = buildOneSheet({
    ym: YM,
    monthLabel: MONTH_LABEL,
    shopName: DUP_SHOP_NAME,
    reports,
    payments: [],
    advances,
    settings: DUP_SETTINGS,
    template,
    ignoreMarks,
  });
  return {
    choice: LABEL[which],
    expenseYen: summary.expenseTotal,
    profitYen: summary.profit,
    notCountedYen: summary.ignoredTotal,
    threeWaysAgree: sheet.expenseCheck.same,
    sheetReady: sheet.verify.ok,
    suspectsLeft: sheet.review.duplicate?.count ?? 0,
  };
}

export type DupCheck = {
  ok: boolean;
  shop: string;
  month: string;
  /** 疑いが1組 見つかったか（見つからなければ、そもそも試せていない） */
  suspectFound: boolean;
  cases: DupCase[];
  problems: string[];
  summary: string;
  note: string;
};

/** 4通りを計算して並べる（通信しない・書き込まない） */
export function buildDupCheck(): DupCheck {
  const reports = dupReports();
  const advances = dupAdvances();
  const found = findDuplicateExpenses({ ym: YM, reports, advances });
  const suspectFound = found.suspects.length === 1;

  const cases: DupCase[] = [
    caseFor("none"),
    caseFor("count-report"),
    caseFor("count-advance"),
    caseFor("both"),
  ];

  const [none, byReport, byAdvance, both] = cases;
  const problems: string[] = [];
  if (!suspectFound) problems.push("同じ支払いの疑いが見つけられませんでした");
  if (none.expenseYen !== AMOUNT * 2) {
    problems.push("決めていないときに、同じ支払いが2回 数えられていません");
  }
  if (byReport.expenseYen !== AMOUNT || byAdvance.expenseYen !== AMOUNT) {
    problems.push("片方だけ数えると決めても、かかったお金が1つ分になりません");
  }
  if (byReport.notCountedYen !== AMOUNT || byAdvance.notCountedYen !== AMOUNT) {
    problems.push("数えなかった額が出てきません（黙って減らしていることになります）");
  }
  if (both.expenseYen !== AMOUNT * 2 || both.notCountedYen !== 0) {
    problems.push("「両方数える」で金額が動いてしまっています");
  }
  for (const c of cases) {
    if (!c.threeWaysAgree) problems.push(`3通りの数え方がそろいません（${c.choice}）`);
    if (!c.sheetReady) problems.push(`1枚の要約が出せません（${c.choice}）`);
  }
  if (none.suspectsLeft !== 1) problems.push("決めていない疑いが、確かめてほしいことに出ていません");
  for (const c of [byReport, byAdvance, both]) {
    if (c.suspectsLeft !== 0) problems.push(`決めたのに疑いが残っています（${c.choice}）`);
  }

  const ok = problems.length === 0;
  return {
    ok,
    shop: DUP_SHOP_NAME,
    month: MONTH_LABEL,
    suspectFound,
    cases,
    problems,
    summary: ok
      ? `架空のお店で試しました：決めていないと かかったお金 ${none.expenseYen.toLocaleString("ja-JP")}円（同じ支払いを2回 数えている）、` +
        `どちらか片方だけ数えると ${byReport.expenseYen.toLocaleString("ja-JP")}円・残ったお金 ${byReport.profitYen.toLocaleString("ja-JP")}円になり、` +
        `数えなかった ${byReport.notCountedYen.toLocaleString("ja-JP")}円 も画面に出ます。` +
        `「別々の支払い」を選んだときは金額が1円も動きません。4通りとも、画面・会計ソフト向けCSV・科目ごとの3通りが一致し、1枚の要約も出せました。`
      : `確かめられなかったことがあります：${problems.join("／")}`,
    note:
      "読むだけの窓口です。倉庫に1行も書き込みません。出している金額はすべて架空のお店のもので、" +
      "手羽屋の実データは1円も入りません。実際のお店の画面では、この選び方を押して決めます" +
      "（決めた内容を残す置き場は /keiri/sql の貼り紙②で出来ます）。",
  };
}
