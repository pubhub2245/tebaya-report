/**
 * 試算表（しさんひょう）を組み立てるところ。
 *
 * 「試算表」＝ 科目ごとに「左（借方）にいくら・右（貸方）にいくら」を
 * ぜんぶ足し上げた1枚の表です。税理士さんと会計ソフトが最初に見る表で、
 * **左の合計と右の合計がぴったり同じになる**のが「帳簿が壊れていない」しるしです
 * （家計簿の最後に「入ったお金と出たお金の合計が合っているか」を見るのと同じ）。
 *
 * ■ なぜ要るのか（2026-10-07・f1-7）
 *   月の締めでお渡しするものとして「試算表」を挙げていたのに、
 *   どこからも出せていませんでした（出せたのは 科目別の経費・現金・CSV・1枚の要約まで）。
 *   試算表が無いと、**会計ソフトに渡す表そのものが正しいかを確かめる道がありません**。
 *   いまの検算は「かかったお金」を3通りに数えるところまでで、
 *   売上の側は1度も突き合わせていませんでした。
 *
 * ■ 守ること
 *   ① **金額を作らない。** 数えるのは仕訳（journal.ts が作った行）だけ。
 *      日報・立替から直接は読みません（CSVと試算表が別々に育つのを防ぐため）。
 *   ② 科目を勝手に増やさない（accounts.ts の12個＋現金・未払金だけ）。
 *   ③ 合わないときは黙って合わせない。合っていないことを出す。
 */

import { ACCOUNTS } from "./accounts";
import type { JournalRow } from "./journal";

/** 仕訳で相手に使う2つの名前（journal.ts と同じ字で合わせる） */
export const CASH_ACCOUNT = "現金";
export const ACCRUED_ACCOUNT = "未払金";

/** 科目の大きな区分（店主にも読めるように、やさしい言葉を添える） */
export type TrialGroupKey = "asset" | "liability" | "revenue" | "expense";

export const TRIAL_GROUP_LABEL: Record<TrialGroupKey, string> = {
  asset: "手元のお金（資産）",
  liability: "まだ払っていないお金（負債）",
  revenue: "売上（収益）",
  expense: "かかったお金（費用）",
};

/** 試算表の1行 */
export type TrialBalanceLine = {
  /** 科目の名前（仕訳に出てくる字そのまま） */
  account: string;
  group: TrialGroupKey;
  /** 左（借方）に出てきた合計 */
  debit: number;
  /** 右（貸方）に出てきた合計 */
  credit: number;
  /** 残り（左 − 右）。マイナスなら右側に残っている */
  balance: number;
  /** 残りがどちら側か */
  side: "借方" | "貸方" | "なし";
  /** 残りの金額（符号なし。表に出すのはこちら） */
  balanceAbs: number;
};

/** 試算表ぜんぶ */
export type TrialBalance = {
  lines: TrialBalanceLine[];
  /** 左（借方）の合計 */
  debitTotal: number;
  /** 右（貸方）の合計 */
  creditTotal: number;
  /** 左と右がぴったり同じか（これが false なら帳簿が壊れている） */
  balanced: boolean;
  /** 売上（収益）の残り */
  revenueTotal: number;
  /** かかったお金（費用）の残り */
  expenseTotal: number;
  /** 売上 − かかったお金（試算表の側から出した利益） */
  profit: number;
  /** もとになった仕訳の行数 */
  rowCount: number;
};

const GROUP_OF = new Map<string, TrialGroupKey>();
GROUP_OF.set(CASH_ACCOUNT, "asset");
GROUP_OF.set(ACCRUED_ACCOUNT, "liability");
for (const a of ACCOUNTS) {
  // 「人件費（当日払い）」は CSV では「人件費」の名前で書かれるので、
  // まとめ先の名前でも引けるようにしておく（accountLabelForCsv と同じ考え方）
  GROUP_OF.set(a.label, a.side === "revenue" ? "revenue" : "expense");
}

/**
 * 科目名から区分を引く。
 * 知らない名前は「かかったお金（費用）」として扱う（画面を止めないため）。
 * ★ただし知らない名前が出たことは unknownAccounts で分かるようにする。
 */
export function groupOfAccount(account: string): TrialGroupKey {
  return GROUP_OF.get(String(account ?? "").trim()) ?? "expense";
}

/** 区分の並び順（表に出す順番） */
const GROUP_ORDER: TrialGroupKey[] = ["asset", "liability", "revenue", "expense"];

/** 科目の並び順（同じ区分の中は accounts.ts の順番。現金・未払金は先） */
const ACCOUNT_ORDER = new Map<string, number>();
ACCOUNT_ORDER.set(CASH_ACCOUNT, 0);
ACCOUNT_ORDER.set(ACCRUED_ACCOUNT, 1);
ACCOUNTS.forEach((a, i) => {
  if (!ACCOUNT_ORDER.has(a.label)) ACCOUNT_ORDER.set(a.label, 10 + i);
});

/**
 * 仕訳の行から試算表を組み立てる。
 *
 * ★ここでは1円も作りません。渡された行を科目ごとに足すだけです。
 */
export function buildTrialBalance(rows: JournalRow[]): TrialBalance {
  const debit = new Map<string, number>();
  const credit = new Map<string, number>();
  const names = new Set<string>();

  const add = (map: Map<string, number>, account: string, amount: number) => {
    const name = String(account ?? "").trim();
    if (!name) return;
    names.add(name);
    map.set(name, (map.get(name) ?? 0) + (Number(amount) || 0));
  };

  for (const r of rows ?? []) {
    add(debit, r.debitAccount, r.debitAmount);
    add(credit, r.creditAccount, r.creditAmount);
  }

  const lines: TrialBalanceLine[] = [...names]
    .map((account) => {
      const d = debit.get(account) ?? 0;
      const c = credit.get(account) ?? 0;
      const balance = d - c;
      return {
        account,
        group: groupOfAccount(account),
        debit: d,
        credit: c,
        balance,
        side: balance > 0 ? ("借方" as const) : balance < 0 ? ("貸方" as const) : ("なし" as const),
        balanceAbs: Math.abs(balance),
      };
    })
    .sort((a, b) => {
      const g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
      if (g !== 0) return g;
      const o =
        (ACCOUNT_ORDER.get(a.account) ?? 999) - (ACCOUNT_ORDER.get(b.account) ?? 999);
      if (o !== 0) return o;
      return a.account < b.account ? -1 : a.account > b.account ? 1 : 0;
    });

  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
  // 売上は右（貸方）に残るので、右 − 左 で「いくら売れたか」にする
  const revenueTotal = lines
    .filter((l) => l.group === "revenue")
    .reduce((s, l) => s + (l.credit - l.debit), 0);
  const expenseTotal = lines
    .filter((l) => l.group === "expense")
    .reduce((s, l) => s + l.balance, 0);

  return {
    lines,
    debitTotal,
    creditTotal,
    balanced: debitTotal === creditTotal,
    revenueTotal,
    expenseTotal,
    profit: revenueTotal - expenseTotal,
    rowCount: (rows ?? []).length,
  };
}

/** 試算表と、画面の数字を突き合わせた結果 */
export type TrialBalanceCheck = {
  /** 左の合計 ＝ 右の合計 */
  balanced: boolean;
  /** 試算表の売上 ＝ 画面の売上 */
  salesSame: boolean;
  /** 試算表のかかったお金 ＝ 画面のかかったお金 */
  expenseSame: boolean;
  /** 試算表の利益 ＝ 画面の利益 */
  profitSame: boolean;
  /** 4つとも合っているか */
  ok: boolean;
  /** 合っていない所の言葉（人が読んで直せるように） */
  problems: string[];
};

/**
 * 試算表を、画面（summarizeMonth）の数字と突き合わせる。
 *
 * ■ ここで初めて確かめられること
 *   これまでの検算は「かかったお金」だけでした。
 *   試算表を通すと **売上と利益も、会計ソフトに渡す表の側から**確かめられます。
 */
export function checkTrialBalance(params: {
  trial: TrialBalance;
  sales: number;
  expenseTotal: number;
  profit: number;
  /** 金額の書き方（画面と同じ書き方を渡す） */
  yen?: (n: number) => string;
}): TrialBalanceCheck {
  const { trial, sales, expenseTotal, profit } = params;
  const yen = params.yen ?? ((n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`);
  const problems: string[] = [];

  if (!trial.balanced) {
    problems.push(
      `試算表の左と右が合っていません（左 ${yen(trial.debitTotal)}／右 ${yen(
        trial.creditTotal,
      )}）。`,
    );
  }
  if (trial.revenueTotal !== sales) {
    problems.push(
      `試算表の売上（${yen(trial.revenueTotal)}）と画面の売上（${yen(sales)}）が違います。`,
    );
  }
  if (trial.expenseTotal !== expenseTotal) {
    problems.push(
      `試算表のかかったお金（${yen(trial.expenseTotal)}）と画面のかかったお金（${yen(
        expenseTotal,
      )}）が違います。`,
    );
  }
  if (trial.profit !== profit) {
    problems.push(
      `試算表の利益（${yen(trial.profit)}）と画面の利益（${yen(profit)}）が違います。`,
    );
  }

  return {
    balanced: trial.balanced,
    salesSame: trial.revenueTotal === sales,
    expenseSame: trial.expenseTotal === expenseTotal,
    profitSame: trial.profit === profit,
    ok: problems.length === 0,
    problems,
  };
}

/** 試算表のCSV（会計ソフト・税理士さんに渡す用）。列は4つだけ */
export const TRIAL_BALANCE_HEADERS = ["科目", "借方合計", "貸方合計", "残高"] as const;

export function trialBalanceToCsv(trial: TrialBalance): string {
  const cell = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [TRIAL_BALANCE_HEADERS.join(",")];
  for (const l of trial.lines) {
    lines.push([cell(l.account), l.debit, l.credit, l.balance].join(","));
  }
  lines.push([cell("合計"), trial.debitTotal, trial.creditTotal, 0].join(","));
  const BOM = "﻿"; // Excel で日本語が文字化けしないための目印
  return BOM + lines.join("\r\n") + "\r\n";
}
