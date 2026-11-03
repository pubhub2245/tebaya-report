/**
 * 「同じ日報が2枚あるときに、押して片付けられるか」を**外から確かめる**ための形
 *                                       （2026-11-03・kp246・f1-5）。
 * **計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るか
 *   押して片付ける所は本物の経理画面（/keiri）に入っていますが、そこは合言葉が要るので
 *   検査役（B2）は開けません。＝ 「選べるようになったか」を外から確かめようがありません。
 *
 * ■ ここが返すもの（外から確かめる窓口の決まりを守る）
 *   ① **金額は1円も返しません**（返すのは件数と○×だけ）
 *   ② 疑いが何組あって、何組 決まっていて、何組 残っているか
 *   ③ **もし「1枚だけ数える」を選んだら**、その月が何件になり、
 *      3通りの数え方がそろい、試算表の左右が合うか（＝選べば片付くことの証拠）
 *   ④ いま押して決められるか（決めた内容をどこに残せるか）
 */

import type { DuplicateReportCheck } from "./duplicates";
import type { MonthlySample } from "./oneSheet";
import {
  canChooseReportDup,
  reportDupGroupKey,
  type ReportDupMarks,
} from "./reportDups";
import { resavedKeySet, type ResavedReportGroup } from "./reportResave";

export type ReportDupWindow = {
  /** 疑いの組（決めたものも入れた全部） */
  groups: number;
  /** まだ決めていない組 */
  pending: number;
  /** 人が決めた組（1枚だけ数える／2枚とも本物） */
  decided: number;
  /** 余分に入っている行の数（まだ決めていない組の分） */
  extraReports: number;
  /** いま押して決められる組の数（行の番号が読めているもの） */
  choosable: number;
  /**
   * **機械が「同じ日の入れ直し」とみて、押さずに1枚だけ数えた**組の数
   *                                             （2026-11-03・f1-5・kp273）。
   * ★この組は pending に入りません（＝人の手なしで片付いています）。
   */
  auto: number;
  /** その組ぜんぶで、入った時刻が読めた組の数（読めないと機械は決めません） */
  enteredTimesRead: number;
  /** 決めた内容をどこに残せるか（shelf＝置き場／memo＝ひとこと欄の控え／none＝残せない） */
  store: "shelf" | "memo" | "none";
  /** 1行の説明（人が読む） */
  note: string;
  /**
   * **もし残っている組ぜんぶに「1枚だけ数える」を選んだら** どうなるか。
   * ★金額は返しません。件数と○×だけです。
   * ★押していません（読むだけの窓口です）。選んだ場合の計算をしてみせているだけです。
   */
  ifCountedOnce: {
    /** 日報の件数（いまの件数から、余分な行の分だけ減る） */
    reportCount: number;
    /** 会計ソフト向けの表の行数 */
    csvRowCount: number;
    /** かかったお金の3通りの数え方がそろうか */
    expenseSame: boolean;
    /** 売上 − かかったお金 ＝ 残ったお金 になるか */
    profitOk: boolean;
    /** 試算表の左右が合い、画面と同じか */
    trialOk: boolean;
    /** 1枚を出せる状態になるか */
    sheetReady: boolean;
    /** 確かめてほしいことから、同じ日報の疑いが消えるか */
    sameReportCleared: boolean;
  } | null;
};

/** 「まだ決めていない組ぜんぶに1枚だけ数えるを選んだ」状態の印を作る（押しません） */
export function simulateCountOnceMarks(
  check: DuplicateReportCheck,
  marks?: ReportDupMarks | null,
): ReportDupMarks {
  const next: ReportDupMarks = {
    skipIds: new Set(marks?.skipIds ?? []),
    countOnce: new Set(marks?.countOnce ?? []),
    bothCounted: new Set(marks?.bothCounted ?? []),
  };
  for (const g of check.groups) {
    const key = reportDupGroupKey(g);
    if (next.countOnce.has(key) || next.bothCounted.has(key)) continue;
    if (!canChooseReportDup(g)) continue;
    next.countOnce.add(key);
    // 並びのあとの行を数えない（どちらを外しても金額は1円も変わらない同じ2枚）
    for (const id of g.ids.slice(1)) {
      const t = String(id ?? "").trim();
      if (t) next.skipIds.add(t);
    }
  }
  return next;
}

export function buildReportDupWindow(params: {
  /** いまの月の疑い（決めたものも入れた全部） */
  check: DuplicateReportCheck;
  marks?: ReportDupMarks | null;
  store: "shelf" | "memo" | "none";
  /** 「1枚だけ数える」を選んだ場合に作り直した1枚（無ければ null） */
  ifCountedOnce?: MonthlySample | null;
  /** 機械が「入れ直し」とみた組（lib/keiri/reportResave.ts の結果） */
  resaved?: readonly ResavedReportGroup[];
}): ReportDupWindow {
  const { check, marks, store } = params;
  const resaved = params.resaved ?? [];
  const autoKeys = resavedKeySet(resaved);
  const decided = check.groups.filter((g) => {
    const key = reportDupGroupKey(g);
    return !!marks && (marks.countOnce.has(key) || marks.bothCounted.has(key));
  }).length;
  const pendingGroups = check.groups.filter((g) => {
    const key = reportDupGroupKey(g);
    // ★機械が入れ直しとみた組は、押さずに片付いているので「残り」に数えない
    if (autoKeys.has(key)) return false;
    return !marks || (!marks.countOnce.has(key) && !marks.bothCounted.has(key));
  });
  const sheet = params.ifCountedOnce ?? null;
  return {
    groups: check.groups.length,
    pending: pendingGroups.length,
    decided,
    extraReports: pendingGroups.reduce((t, g) => t + (g.count - 1), 0),
    choosable: pendingGroups.filter((g) => canChooseReportDup(g)).length,
    auto: autoKeys.size,
    enteredTimesRead: resaved.length,
    store,
    note:
      pendingGroups.length === 0
        ? autoKeys.size > 0
        ? `同じ日報が2枚 入っている疑いは残っていません（うち ${autoKeys.size}組は、同じ日の入れ直しとみて機械が自動で1枚だけ数えました）。`
        : "同じ日報が2枚 入っている疑いは残っていません。"
        : store === "none"
          ? "どちらを数えるかを残しておく置き場が無いので、いまは疑いを出すだけです。"
          : "経理の画面（/keiri）で、1組ごとに［同じ中身なので1枚だけ数える］［2枚とも本物］を押して決められます。日報は消えません。",
    ifCountedOnce: sheet
      ? {
          reportCount: sheet.reportCount,
          csvRowCount: sheet.journalRowCount,
          expenseSame: sheet.expenseCheck.same,
          profitOk: sheet.verify.profitOk,
          trialOk: sheet.verify.trialOk,
          sheetReady: sheet.verify.ok,
          sameReportCleared: sheet.review.sameReport === null,
        }
      : null,
  };
}
