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
  /**
   * いま測れたか（2026-11-06・f1-5）。
   * false のときは、下の○×は**ぜんぶ null**です（合格にも不合格にもしていません）。
   */
  measurable: boolean;
  /** 集計に使った日報の件数（金額ではないので出す） */
  reportCount: number;
  /** 会計ソフト向けCSVの行数（0なら作れていない） */
  csvRowCount: number;
  /** かかったお金を3通りに数えて、3つとも同じ数字になったか（f1-2）。null ＝ 測れていない */
  expenseSame: boolean | null;
  /** 売上 − かかったお金 ＝ 残ったお金 になっているか。null ＝ 測れていない */
  profitOk: boolean | null;
  /** まだ払っていないお金の内訳の合計が、その見出しと合っているか。null ＝ 測れていない */
  unpaidOk: boolean | null;
  /**
   * 試算表（科目ごとの借方・貸方の合計）が出て、左右の合計が合っているか（f1-7）。
   * ★金額は返しません。合っているかと、何科目あるかだけです。
   */
  trial: {
    /** 試算表が作れたか（科目が1つ以上あるか）。null ＝ 測れていない */
    ready: boolean | null;
    /** 左の合計 ＝ 右の合計。null ＝ 測れていない */
    balanced: boolean | null;
    /** 科目の数 */
    accountCount: number;
    /** 試算表の売上・かかったお金・利益が、画面の数字と1円まで同じか。null ＝ 測れていない */
    matchesScreen: boolean | null;
  };
  /** 3つとも合ったか（＝1枚をお店に出せる状態か）。null ＝ 測れていない */
  sheetReady: boolean | null;
  /** 合っていない所（金額は伏せてある） */
  problems: string[];
  /**
   * 現金の数え方（kp233・f1-4）。**件数と○×だけ**。金額は返さない。
   * ・reconciles … 「現金の数え方」の最後の行が、画面の現金とぴったり同じか
   * ・advanceCount / noncashCount … 金庫から出ていないと見分けた行の数
   *
   * ★**reconciles は「実際の金庫と合ったか」ではありません**（2026-11-11・f1-4）。
   *   紙の上の足し算（数え始め＋売上−経費−…）が、画面に出している現金と
   *   同じ数字になるか、だけです。**金庫を1回も数えていない月でも true になります。**
   *   2026-11-11 に、この true を f1-4（実際の金庫と合うか）の「合う」と読んだ報告が
   *   出ました（同じ窓口の cashCount は countRecords 0・latestCountOn null）。
   *   取り違えないように、意味を言葉にした means と、
   *   本当の合否がどこにあるかを指す safeMatchWindow を同じ所に置きます。
   */
  cash: {
    /** null ＝ 測れていない */
    reconciles: boolean | null;
    advanceCount: number;
    noncashCount: number;
    /** reconciles が何を見ているか（人が読む1行） */
    means?: string;
    /** 実際の金庫と合ったかを答える窓口（f1-4 の合否はこちら） */
    safeMatchWindow?: string;
  };
  /** 人に確かめてもらう必要があるもの（件数だけ） */
  needsHuman: {
    /** 種類が分からず「雑費」に入れた経費の件数 */
    unmatched: number;
    /** 同じ支払いが2か所にある疑いの件数 */
    duplicate: number;
    /** 同じ日報が2回 入っている疑いの組の数（2026-11-03） */
    duplicateReports: number;
    /** レシートの写真が無い支払いの件数（分からないときは null） */
    noReceipt: number | null;
  };
  /** 人が読む1行 */
  summary: string;
  note: string;
};

/**
 * `cash.reconciles` が何を見ているか（2026-11-11・f1-4）。
 * **「実際の金庫と合ったか」ではありません。**
 */
export const CASH_RECONCILES_MEANS =
  "reconciles は**紙の上の足し算**です（『現金の数え方』の最後の行が、" +
  "画面に出している現金と同じ数字か）。**実際の金庫と合ったかではありません。** " +
  "金庫を1回も数えていない月でも true になります（同じ窓口の cashCount を見てください。" +
  "countRecords が 0 なら、まだ1回も数えていません）。";

/** 実際の金庫と合ったかを答える窓口（f1-4 の合否はここ1か所） */
export const SAFE_MATCH_WINDOW =
  "/api/keiri/cashcount（f1-4 の合否は、この窓口の ok 1か所だけで決めています。" +
  "ok が null のときは合否を付けないでください）";

export const SELF_CHECK_NOTE =
  "読むだけの窓口です。金額・お店の名前・連絡先・鍵の値は1文字も返しません。";

/**
 * 読めなかったときの返事（数字を作らない）。
 *
 * ★2026-11-06（f1-5・f1-2・f1-7）：**○×を「×」にしません。**
 *   それまでは、倉庫が読めなかった日も
 *   `expenseSame: false` `profitOk: false` `trial.balanced: false` `cash.reconciles: false`
 *   と「×」で返していました。読んでいないのに×なので、
 *   これを見た検査役は「利益が合っていない＝不合格」と読めてしまいます
 *   （**測っていないことを不合格にする**形）。
 *   逆向きの同じ間違い（止まっているのに合格）は 11/6 のお昼に
 *   合否を測る3つの窓口でふさぎました。ここは**まとめの窓口**の同じ穴です。
 *   いまは `measurable: false` と、○×ぜんぶ **null（測れていない）** で返します。
 */
export function unreadableSelfCheck(params: { month: string; ym: string; reason: string }): KeiriSelfCheck {
  return {
    month: params.month,
    ym: params.ym,
    readable: false,
    measurable: false,
    reportCount: 0,
    csvRowCount: 0,
    expenseSame: null,
    profitOk: null,
    unpaidOk: null,
    trial: { ready: null, balanced: null, accountCount: 0, matchesScreen: null },
    cash: {
      reconciles: null,
      advanceCount: 0,
      noncashCount: 0,
      means: CASH_RECONCILES_MEANS,
      safeMatchWindow: SAFE_MATCH_WINDOW,
    },
    sheetReady: null,
    problems: [maskYen(params.reason)],
    needsHuman: { unmatched: 0, duplicate: 0, duplicateReports: 0, noReceipt: null },
    summary:
      `${params.month}：いまは測れませんでした（${params.reason}）。` +
      "合格にも不合格にもしていません（○×はぜんぶ「測れていない」で返しています）。" +
      "倉庫が読めるようになってから、もう一度 開いてください。",
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
    // 同じ日報が2回 入っている疑い（2026-11-03・f1-1／f1-5）。
    // ★上の duplicate は「経費と立替の二重」だけなので、こちらは別に数える。
    duplicateReports: sheet.review.sameReport?.count ?? 0,
    noReceipt: sheet.review.noReceiptCount,
  };
  const waiting: string[] = [];
  if (needsHuman.duplicate > 0) waiting.push(`同じ支払いが2か所にある疑い ${needsHuman.duplicate}件`);
  if (needsHuman.duplicateReports > 0) {
    waiting.push(
      `同じ日報が2回 入っている疑い ${needsHuman.duplicateReports}組（余分な行 ${
        sheet.review.sameReport?.extraReports ?? 0
      }件）`,
    );
  }
  if (needsHuman.unmatched > 0) waiting.push(`種類が分からない経費 ${needsHuman.unmatched}件`);

  const summary = v.ok
    ? `${params.month}：日報${sheet.reportCount}件から、1枚と会計ソフト向けCSV（${sheet.journalRowCount}行）が人の手なしで出ました。かかったお金の3通りの数え方も一致しています。` +
      (waiting.length > 0 ? `ただし人に確かめてもらうものが残っています（${waiting.join("・")}）。` : "")
    : `${params.month}：検算が合わないので1枚は出せません（${v.problems.length}件）。`;

  return {
    month: params.month,
    ym: params.ym,
    readable: true,
    measurable: true,
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
    // 現金の数え方の最後の行が、画面の現金と同じかを外から見えるようにする（kp233・f1-4）
    cash: {
      reconciles: cashRuleReconciles(sheet),
      advanceCount: sheet.cash?.advanceCount ?? 0,
      noncashCount: sheet.cash?.noncashCount ?? 0,
      means: CASH_RECONCILES_MEANS,
      safeMatchWindow: SAFE_MATCH_WINDOW,
    },
    sheetReady: v.ok,
    // ★「問題0件」と「同じ日報を二重に数えている」が同時に出ないようにする
    //   （2026-11-03 09:58 B2 の指摘）。1枚そのものは止めません
    //   ——止めると、人が決めるまで毎月の1枚が1枚も出なくなるためです。
    problems: [
      ...v.problems.map(maskYen),
      ...(needsHuman.duplicateReports > 0
        ? [
            `同じ日報が2枚あるかもしれません（${needsHuman.duplicateReports}組・余分な行 ${
              sheet.review.sameReport?.extraReports ?? 0
            }件）。どちらを数えるかを人が決めるまで、売上と経費がその分 二重に入ったままです。`,
          ]
        : []),
    ],
    needsHuman,
    summary,
    note: SELF_CHECK_NOTE,
  };
}

/**
 * 「現金の数え方」の最後の行が、1枚に出している現金とぴったり同じか（kp233・f1-4）。
 *
 * ★金額は返しません。**同じかどうか**だけを返します。
 *   ここが false なら、紙の上で足し算が合っていないということなので、
 *   数えた金庫の金額と比べても意味がありません。
 */
export function cashRuleReconciles(sheet: MonthlySample): boolean {
  const lines = sheet.cash?.ruleLines ?? [];
  const last = lines[lines.length - 1];
  if (!last) return false;
  const digits = last.replace(/[^0-9-]/g, "");
  if (digits === "") return false;
  return Number(digits) === Math.round(sheet.cash.balance);
}
