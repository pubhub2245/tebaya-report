/**
 * 金庫を数えるときに「同じ中身の日報が2枚」をどう数えるかを、
 * **経理の画面と1枚の要約にそろえる**ところ（2026-11-15・f1-4）。
 * **計算だけ**（倉庫は触りません・金額は1円も作りません・1行も書き換えません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   10月の手羽屋の記録には、**まったく同じ中身の日報が2枚ずつ**入っている日が2日あります
 *   （10/11・10/12。どちらも 10/13 に12分あけて入れ直されたもの）。
 *   経理の画面・1枚の要約・会計ソフト向けCSV・試算表は、2026-11-03 から
 *   この「入れ直しの1枚」を**人が押さなくても数えない**ようにしてあります
 *   （lib/keiri/reportResave.ts・f1-5・kp273）。
 *
 *   ところが、**金庫の合否を測る窓口（/api/keiri/cashcount）だけ**が、
 *   その印を読まずに日報を**そのまま全部**数えていました。
 *   ＝ 同じ日・同じ倉庫を見ているのに、
 *     ・画面の「計算上の現金」は 入れ直しの1枚を抜いた額
 *     ・窓口の「計算上の現金」は 入れ直しの1枚を**足したままの額**
 *   という**2通りの金額**が出ます（10月ぶんで 売上 45,050円 − 経費 10,317円 ＝ **34,733円**）。
 *
 *   じゅんが金庫を1分 数えると、窓口のほうは そのぶん「金庫が足りない」と出ます。
 *   しかもその差には**名前が付きません**（内わけの5つはどれも当てはまらない）。
 *   ＝ **帳簿は合っているのに、f1-4 が不合格に見える**形でした。ここをそろえます。
 *
 * ■ ここでやること
 *   ① 画面とまったく同じ道（人の印 ＋ 機械が決めた入れ直し）で、数えない1枚を外す
 *   ② 外した分を**黙って減らさない**ように、件数をそのまま外へ出す
 *   ③ **まだ決めていない**組（機械も人も決めていない＝今も二重で数えている分）は、
 *      金庫の差の「名前が付いた分」として出せるように、幅（0円〜その額）を返す
 *
 * ■ ここで絶対にしないこと
 *   ・日報を消さない・書き換えない（外すのは数えるときだけ。印も置きません）
 *   ・人が決めた印を機械が上書きしない（lib/keiri/reportResave.ts の決まりのまま）
 *   ・読めなかったときに「0組」と言わない（readable を false にして、幅に足さない）
 *   ・手羽屋が毎日使う画面（日報・シフト・レジ・LINE・lib/money.ts）には1行も触らない
 */

import { findDuplicateReports } from "./duplicates";
import {
  excludeDecidedDuplicateReports,
  pendingReportDupGroups,
  readReportDupMarks,
  reportDupDecision,
  type ReportDupRow,
  type SkippedReport,
} from "./reportDups";
import { findResavedAllMonths, withResaveMarks } from "./reportResave";
import type { KeiriReport } from "./types";

/** 金庫の差にかかわる「同じ日報が2枚」の見立て */
export type CashDupReportsGap = {
  /** 日報を読めたか（読めていなければ、幅にも足さない） */
  readable: boolean;
  /** 機械が「同じ日の入れ直し」とみて自動で1枚だけ数えた組の数 */
  autoGroups: number;
  /** 人が画面で押して決めた組の数 */
  decidedGroups: number;
  /** まだ誰も決めていない組の数（いまも二重で数えている分） */
  pendingGroups: number;
  /** 数えないことにした行の数（自動＋人） */
  skippedRows: number;
  /**
   * まだ決めていない分が「計算上の現金」に二重で入っている額（売上 − 経費）。
   * プラスなら、そのぶん計算上の現金が多く出ている＝差は「金庫のほうが少ない」側に動く。
   */
  pendingNet: number;
  /** 画面と窓口に出すひとこと（金額は入れない） */
  note: string;
};

export const EMPTY_CASH_DUP_REPORTS_GAP: CashDupReportsGap = {
  readable: false,
  autoGroups: 0,
  decidedGroups: 0,
  pendingGroups: 0,
  skippedRows: 0,
  pendingNet: 0,
  note: "日報を読めていないので、同じ日報が2枚 入っているかは数えていません（0組という意味ではありません）。",
};

function monthsOf(reports: readonly KeiriReport[]): string[] {
  const months = new Set<string>();
  for (const r of reports) {
    const m = String(r.date ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) months.add(m);
  }
  return Array.from(months).sort();
}

/** その日は、金庫を数えている期間の中か（数え始めの日 〜 数えた日） */
function inWindow(date: string, openingDate?: string | null, asOf?: string | null): boolean {
  const d = String(date ?? "");
  if (!d) return false;
  const from = String(openingDate ?? "").trim();
  const to = String(asOf ?? "").trim();
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/**
 * 画面と同じ数え方で日報をそろえ、同じ日報が2枚の分を見立てる（純粋な計算）。
 *
 * ★印が1つも無く、入れ直しも1組も無ければ、**渡した日報がそのまま返ります**
 *   （＝今までとまったく同じ金額）。
 */
export function measureCashDupReports(params: {
  reports: readonly KeiriReport[];
  reportDups?: readonly ReportDupRow[] | null;
  /** 日報の棚を読めなかった（0件と取り違えないため） */
  unreadable?: boolean;
  /** 数え始めの日（YYYY-MM-DD） */
  openingDate?: string | null;
  /** 数えた日（YYYY-MM-DD） */
  asOf?: string | null;
}): { reports: KeiriReport[]; skipped: SkippedReport[]; gap: CashDupReportsGap } {
  const raw = [...(params.reports ?? [])];
  if (params.unreadable) {
    return { reports: raw, skipped: [], gap: { ...EMPTY_CASH_DUP_REPORTS_GAP } };
  }

  const marks = readReportDupMarks(params.reportDups ?? []);
  const resaved = findResavedAllMonths({ reports: raw, marks });
  const effective = withResaveMarks(resaved, marks);
  const { reports, skipped } = excludeDecidedDuplicateReports({ reports: raw, marks: effective });

  // まだ決めていない組（＝いまも二重で数えている分）を、数える期間の中だけ集める
  let pendingGroups = 0;
  let pendingNet = 0;
  let decidedGroups = 0;
  for (const ym of monthsOf(raw)) {
    const check = findDuplicateReports({ ym, reports: raw });
    for (const g of check.groups) {
      if (!inWindow(g.date, params.openingDate, params.asOf)) continue;
      // 機械が決めた入れ直しは effective に入っているので pending には出てこない
      if (reportDupDecision(g, effective) !== "pending") {
        if (reportDupDecision(g, marks) !== "pending") decidedGroups += 1;
        continue;
      }
      pendingGroups += 1;
      pendingNet += (Number(g.extraSales) || 0) - (Number(g.extraExpense) || 0);
    }
    // 使っていないが、決まりを1か所に置くため（pending の数え方は画面と同じ関数）
    void pendingReportDupGroups(check, effective);
  }

  const autoGroups = resaved.length;
  const skippedRows = skipped.length;

  const parts: string[] = [];
  if (autoGroups > 0) {
    parts.push(
      `同じ日に入れ直された日報 ${autoGroups}組（${skippedRows}行）は、` +
        "経理の画面・1枚の要約と同じように1枚だけ数えています（日報は残っています）",
    );
  }
  if (pendingGroups > 0) {
    parts.push(
      `まだどちらを数えるか決めていない組が ${pendingGroups}組 あります。` +
        "その分は いまも両方 数えているので、金庫のほうが少なく出ることがあります",
    );
  }
  const note =
    parts.length > 0
      ? `${parts.join("。")}。`
      : "同じ中身の日報が2枚 入っている組はありません（この分で食い違うことはありません）。";

  return {
    reports,
    skipped,
    gap: {
      readable: true,
      autoGroups,
      decidedGroups,
      pendingGroups,
      skippedRows,
      pendingNet: Math.round(pendingNet),
      note,
    },
  };
}

/**
 * 外から確かめる窓口に返す形。
 * **本物の金額は1円も返しません**（lib/keiri/checkWindow.ts の決まり③）。
 */
export type CashDupReportsWindow = {
  readable: boolean;
  autoGroups: number;
  decidedGroups: number;
  pendingGroups: number;
  skippedRows: number;
  /** 画面にこの行が出るか */
  shown: boolean;
  note: string;
  howto: string;
};

export function buildCashDupReportsWindow(gap: CashDupReportsGap): CashDupReportsWindow {
  return {
    readable: gap.readable,
    autoGroups: gap.autoGroups,
    decidedGroups: gap.decidedGroups,
    pendingGroups: gap.pendingGroups,
    skippedRows: gap.skippedRows,
    shown: gap.readable && (gap.autoGroups > 0 || gap.pendingGroups > 0),
    note: gap.note,
    howto:
      "ここは「金庫の計算が、経理の画面・1枚の要約と同じ日報を数えているか」を見る所です。" +
      "autoGroups が1組以上あるときは、その余分な1枚を**どちらも数えていません**（金額は同じになります）。" +
      "pendingGroups が1組以上あるときは、まだ両方 数えているので、" +
      "その分は差の内わけ『同じ中身の日報が2枚（まだ決めていない分）』に幅として出ます。" +
      "readable が false の日は読めなかった日で、**0組という意味ではありません**。",
  };
}
