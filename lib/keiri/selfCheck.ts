/**
 * 「前の月の締めが、人の手を借りずに正しく出たか」を**外から確かめられる形**にする（f1-5・f1-2）。
 *
 * ■ なぜ要るか（2026-10-05）
 *   毎月お渡しする1枚（/keiri/monthly）も経理画面（/keiri）も **合言葉の内側**にあります。
 *   そのため「本物のデータで、ちゃんと出ているのか」を外から確かめる道がなく、
 *   仕上げチェック表の f1-5 がずっと「未」のまま動けませんでした。
 *
 * ■ 返すもの・返さないもの
 *   ・返す … ○か×か、何件か、どの月か、合っていない所の言葉（金額は伏せる）
 *   ・**返さない** … 金額（1円も）、お店の名前、連絡先、鍵や合言葉の値
 *   見られて困る数字を外に出さずに、「合っているか」だけが分かるようにします。
 */

import type { MonthlySample } from "@/lib/keiri/oneSheet";

/** 金額を伏せる。「1,234,567円」→「◯円」。数字そのものを外に出さないため */
export function maskYen(text: string): string {
  return String(text ?? "").replace(/[0-9０-９][0-9０-９,，]*/g, "◯");
}

export type KeiriSelfCheck = {
  /** どの月を見たか（「2026年9月」） */
  month: string;
  ym: string;
  /** 倉庫から前の月のデータが読めたか */
  readable: boolean;
  /** 集計に使った日報の件数（金額ではないので出す） */
  reportCount: number;
  /** 会計ソフト向けCSVの行数（0なら作れていない） */
  csvRowCount: number;
  /** かかったお金を3通りに数えて、3つとも同じ数字になったか（f1-2） */
  expenseSame: boolean;
  /** 売上 − かかったお金 ＝ 残ったお金 になっているか */
  profitOk: boolean;
  /** まだ払っていないお金の内訳の合計が、その見出しと合っているか */
  unpaidOk: boolean;
  /**
   * 試算表（科目ごとの借方・貸方の合計）が出て、左右の合計が合っているか（f1-7）。
   * ★金額は返しません。合っているかと、何科目あるかだけです。
   */
  trial: {
    /** 試算表が作れたか（科目が1つ以上あるか） */
    ready: boolean;
    /** 左の合計 ＝ 右の合計 */
    balanced: boolean;
    /** 科目の数 */
    accountCount: number;
    /** 試算表の売上・かかったお金・利益が、画面の数字と1円まで同じか */
    matchesScreen: boolean;
  };
  /** 3つとも合ったか（＝1枚をお店に出せる状態か） */
  sheetReady: boolean;
  /** 合っていない所（金額は伏せてある） */
  problems: string[];
  /** 人に確かめてもらう必要があるもの（件数だけ） */
  needsHuman: {
    /** 種類が分からず「雑費」に入れた経費の件数 */
    unmatched: number;
    /** 同じ支払いが2か所にある疑いの件数 */
    duplicate: number;
    /** レシートの写真が無い支払いの件数（分からないときは null） */
    noReceipt: number | null;
  };
  /** 人が読む1行 */
  summary: string;
  note: string;
};

export const SELF_CHECK_NOTE =
  "読むだけの窓口です。金額・お店の名前・連絡先・鍵の値は1文字も返しません。";

/** 読めなかったときの返事（数字を作らない） */
export function unreadableSelfCheck(params: { month: string; ym: string; reason: string }): KeiriSelfCheck {
  return {
    month: params.month,
    ym: params.ym,
    readable: false,
    reportCount: 0,
    csvRowCount: 0,
    expenseSame: false,
    profitOk: false,
    unpaidOk: false,
    trial: { ready: false, balanced: false, accountCount: 0, matchesScreen: false },
    sheetReady: false,
    problems: [maskYen(params.reason)],
    needsHuman: { unmatched: 0, duplicate: 0, noReceipt: null },
    summary: `${params.month}：倉庫から読めませんでした（${params.reason}）`,
    note: SELF_CHECK_NOTE,
  };
}

/** 1枚の要約（本物と同じ関数で作ったもの）から、外に出してよい形だけを取り出す */
export function buildSelfCheck(params: {
  month: string;
  ym: string;
  sheet: MonthlySample;
}): KeiriSelfCheck {
  const { sheet } = params;
  const v = sheet.verify;
  const needsHuman = {
    unmatched: sheet.review.unmatched.length,
    duplicate: sheet.review.duplicate?.count ?? 0,
    noReceipt: sheet.review.noReceiptCount,
  };
  const waiting: string[] = [];
  if (needsHuman.duplicate > 0) waiting.push(`同じ支払いが2か所にある疑い ${needsHuman.duplicate}件`);
  if (needsHuman.unmatched > 0) waiting.push(`種類が分からない経費 ${needsHuman.unmatched}件`);

  const summary = v.ok
    ? `${params.month}：日報${sheet.reportCount}件から、1枚と会計ソフト向けCSV（${sheet.journalRowCount}行）が人の手なしで出ました。かかったお金の3通りの数え方も一致しています。` +
      (waiting.length > 0 ? `ただし人に確かめてもらうものが残っています（${waiting.join("・")}）。` : "")
    : `${params.month}：検算が合わないので1枚は出せません（${v.problems.length}件）。`;

  return {
    month: params.month,
    ym: params.ym,
    readable: true,
    reportCount: sheet.reportCount,
    csvRowCount: sheet.journalRowCount,
    expenseSame: sheet.expenseCheck.same,
    profitOk: v.profitOk,
    unpaidOk: v.unpaidOk,
    // ★読むだけの窓口なので、万一 試算表が入っていなくても落とさない（分からないと返す）
    trial: {
      ready: (sheet.trial?.lines?.length ?? 0) > 0,
      balanced: sheet.trial?.balanced ?? false,
      accountCount: sheet.trial?.lines?.length ?? 0,
      matchesScreen: sheet.trialCheck?.ok ?? false,
    },
    sheetReady: v.ok,
    problems: v.problems.map(maskYen),
    needsHuman,
    summary,
    note: SELF_CHECK_NOTE,
  };
}
