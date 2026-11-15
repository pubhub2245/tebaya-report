/**
 * 事例1号（手羽屋）の数字を、日報データから自動で出す。
 *
 * ■ なぜ作ったか
 *   紹介ページの数字を手で書いていると、月が変わるたびに古くなる。
 *   「2026年8月の実績」と書いたまま年を越すと、それだけで信用を失う。
 *
 * ■ 2026-10-05 の直し（f1-5・f1-2／A が見つけた 51万円 のズレ）
 *   それまで、このファイルは**自分だけの計算**で「月の利益」を出していました。
 *   日報1件ずつに calcActualProfit（売上 − 日当 − レジから払った経費）を当てる形で、
 *   **立て替えて払った経費・外注費・家賃がまるごと落ちていました。**
 *   9月の手羽屋で実測すると、ページには 35.1万円 の黒字と出ていたのに、
 *   経理画面・会計ソフト向けCSV・毎月お渡しする1枚が使っている数え方では
 *   **−159,854円（赤字）** で、**51万円ちがって**いました。
 *   店主にお見せするページで、月の利益が他の画面と違うのは致命的なので、
 *   ここも **summarizeMonth（lib/keiri/aggregate.ts）だけ**を通すようにしました。
 *   ＝「月の経費と利益はこの1つが正」（CLAUDE.md 4-1・5-4b）に合流させた、ということです。
 *
 * ■ 決めごと
 *   - 数えるのは **前の月（まるまる終わった月）** だけ。途中の月は「実績」と呼べない
 *   - 数えるのは **手羽屋の日報だけ**（`shop` が「手羽屋」か空の行）。
 *     同じアプリには **もも屋** の日報も入っており、混ぜると
 *     紹介ページが「屋台『手羽屋』の実績」と名乗ったまま別の屋号の売上まで足してしまう。
 *     送り先は同じ催事に出ている同業なので、出店回数を水増しすると すぐ分かる
 *   - 日報は **keiri_reports**（レシート写真の住所を抜いた軽い見え方）から読む。
 *     daily_reports の明細を直接読むと重い（CLAUDE.md 4-2）
 *   - 利益は **経理画面と同じ summarizeMonth の結果**。自前の計算をここに書かない
 *   - **同じ支払いが2か所にある疑いが1件でもある月は、利益を出さない**（null）。
 *     疑いが残ったままの利益は、黒字でも赤字でも「正しい数字」とは言えないため。
 *     毎月お渡しする1枚で「検算が合わない月は出さない」としたのと同じ考え方です
 *   - 倉庫が読めない・日報が1件も無いときは **手で確認した控えの数字に戻す**。
 *     数字を作らない・空欄にしない（CLAUDE.md 4-10 と同じ考え方）
 *   - 読むだけ。書き込みはしない
 */

import { CASE_TEBAYA } from "@/lib/keiri/caseNumbers";
import { measureCashDupReports } from "@/lib/keiri/cashDupReports";
import { summarizeMonth } from "@/lib/keiri/aggregate";
import { findDuplicateExpenses } from "@/lib/keiri/duplicates";
import {
  pendingSuspects,
  readIgnoreMarks,
  type IgnoreMarks,
} from "@/lib/keiri/expenseIgnores";
import { loadKeiriMonthServer, shiftDate } from "@/lib/keiri/loadMonthServer";
import type { ReportDupRow } from "@/lib/keiri/reportDups";
import { templateFor } from "@/lib/keiri/index";
import type {
  BusinessTemplate,
  KeiriAdvance,
  KeiriReport,
  KeiriSettings,
} from "@/lib/keiri/types";

export { shiftDate };

/** 紹介ページに出す1か月の実績 */
export type CaseStats = {
  /** 「2026年8月」 */
  month: string;
  /** 出店した回数（日報の件数） */
  days: number;
  /** 売上高（万円・小数1桁） */
  salesMan: number;
  /** 実績ベースの利益（万円・小数1桁）。確かめられないときは null（画面は出さない） */
  profitMan: number | null;
  /** 数字を確認した日（自動なら集計した日） */
  checkedOn: string;
  /** 日報から自動で出した数字か（false＝手で確認した控え） */
  auto: boolean;
  /**
   * 利益を出さなかった理由（出したときは null）。
   * 画面には出しません。**なぜ枠が消えているのか**を、あとから人が追えるようにするためです。
   */
  profitHiddenReason: string | null;
};

type ReportRow = {
  date: string;
  /** どの屋号の日報か（「手羽屋」／「もも屋」）。空＝古い日報で、既定は手羽屋 */
  shop?: string | null;
  sales_amount: number | null;
  labor: number | null;
  expenses?: unknown;
};

/**
 * 事例1号として数える屋号。
 * このアプリには手羽屋ともも屋の日報が同じ棚に入っているので、名乗ったほうだけを数える。
 */
export const CASE_SHOP = "手羽屋";

/** 事例1号の業態コード（手羽屋） */
export const CASE_BUSINESS_CODE = "tebaya";

/**
 * その日報を事例1号（手羽屋）として数えてよいか。
 *
 * 空（null・空文字）は **手羽屋** として数える。
 * 日報の既定が手羽屋で、もも屋を選んだときだけ「もも屋」が入るため
 * （lib/formState.ts の shop の既定値）。古い日報に空が残っていても取りこぼさない。
 */
export function isCaseShopRow(row: { shop?: string | null }): boolean {
  const s = String(row.shop ?? "").trim();
  return s === "" || s === CASE_SHOP;
}

/** 円 → 万円（小数1桁）。0.05万円未満は 0 になる */
export function toMan(yen: number): number {
  return Math.round((yen / 10000) * 10) / 10;
}

/** 前の月の範囲（YYYY-MM-01 〜 月末）と表示名 */
export function previousMonthRange(today: Date): { start: string; end: string; label: string } {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0始まり。今月
  const prev = new Date(y, m - 1, 1);
  const py = prev.getFullYear();
  const pm = prev.getMonth() + 1;
  const lastDay = new Date(py, pm, 0).getDate();
  const mm = String(pm).padStart(2, "0");
  return {
    start: `${py}-${mm}-01`,
    end: `${py}-${mm}-${String(lastDay).padStart(2, "0")}`,
    label: `${py}年${pm}月`,
  };
}

/** 事例ページに出す1か月ぶんの数字（純粋な計算。テストはここに掛ける） */
export type CaseMonthFigures = {
  days: number;
  salesYen: number;
  /** 月の経費の合計（立替・人件費・外注費・家賃も入る。summarizeMonth と同じ1つ） */
  expenseYen: number;
  /** 利益 ＝ 売上 − 経費合計 */
  profitYen: number;
  /** この利益を画面に出してよいか */
  profitTrusted: boolean;
  /** 出せない理由（出せるときは null） */
  untrustedReason: string | null;
};

/**
 * 手羽屋の日報と立替から、その月の数字を出す。
 *
 * ★利益は **summarizeMonth** の結果をそのまま使う。ここで計算し直さない。
 * ★同じ支払いが2か所にある疑いがある月は、利益を「出せない」として返す。
 */
export function summarizeCaseMonth(params: {
  ym: string;
  rows: ReportRow[];
  advances: KeiriAdvance[];
  settings: KeiriSettings;
  template: BusinessTemplate;
  /** そのお店の設定の行が倉庫に見つからなかったか（家賃・外注率が当てずっぽうになる） */
  settingsMissing?: boolean;
  /** 立替の棚が読めなかったか（読めないまま数えると、経費がまるごと落ちる） */
  advancesUnreadable?: boolean;
  /**
   * 「同じ支払いが2か所にある」ときに、どちらを数えるかを人が決めた印（kp230）。
   * ★決めた組は疑いから外れるので、**全部 決まれば利益を出せるようになります**。
   *   渡さなければ印なし＝今までどおり（疑いが1件でもあれば利益は出しません）。
   */
  ignoreMarks?: IgnoreMarks;
  /**
   * 「同じ中身の日報が2枚」の印（2026-11-15・f1-4）。
   * ★経理の画面・1枚の要約・会計ソフト向けCSV・試算表は、同じ日に入れ直された
   *   余分な1枚を**人が押さなくても数えません**（lib/keiri/reportResave.ts）。
   *   ここだけ全部 数えていると、**店主にお見せするページの出店回数と売上だけが多く出ます**
   *   （2026-11-15 本番で実測：10月は このページだけ 15回・ほかは全部 13件）。
   *   渡さなければ印なし＝「入れ直し」の見分けだけが効きます（金額は作りません）。
   */
  reportDups?: readonly ReportDupRow[] | null;
}): CaseMonthFigures {
  const { ym, advances, settings, template } = params;
  // もも屋の日報は数えない（倉庫から取るときにも絞るが、片方だけ直しても狂わないように）
  const rawReports = params.rows.filter(isCaseShopRow) as unknown as KeiriReport[];

  /**
   * ★経理の画面・1枚の要約とまったく同じ日報を数える（2026-11-15・f1-4）。
   *   日報は1行も消さず、数えるときだけ 余分な1枚を外します。
   */
  const dupAligned = measureCashDupReports({ reports: rawReports, reportDups: params.reportDups });
  const reports = dupAligned.reports;

  const ignoreMarks = params.ignoreMarks;
  const summary = summarizeMonth({ ym, reports, template, settings, advances, ignoreMarks });
  // ★人が「どちらを数えるか」を決めた組は、疑いから外す（kp230）
  const found = findDuplicateExpenses({ ym, reports, advances });
  const dup = ignoreMarks ? pendingSuspects(found.suspects, ignoreMarks) : found;

  const reasons: string[] = [];
  if (dup.suspects.length > 0) {
    reasons.push(
      `同じ支払いが2か所にある疑いが${dup.suspects.length}件` +
        `（同じ月 ${dup.doubleCountedTotal}円・月をまたぐ ${dup.crossMonthTotal}円）`,
    );
  }
  if (params.settingsMissing) {
    reasons.push("経理の設定（家賃・外注費の率）が倉庫から読めなかった");
  }
  if (dupAligned.gap.pendingGroups > 0) {
    // ★まだ誰も「どちらを数えるか」を決めていない組が残っている月は、
    //   その分いまも両方 数えているので、利益を「正しい数字」とは言いません
    //   （同じ支払いが2か所にある疑いと同じ扱い）。
    reasons.push(
      `同じ中身の日報が2枚 入っている組が${dupAligned.gap.pendingGroups}件（まだどちらを数えるか決めていない）`,
    );
  }
  if (params.advancesUnreadable) {
    // ★ここが肝。立替が読めないまま数えると経費がまるごと落ちて、
    //   2026-10-05 に見つかった「51万円 多い利益」と同じことが起きる。
    reasons.push("立て替えて払った経費の棚が読めなかった");
  }

  return {
    days: summary.reportCount,
    salesYen: summary.sales,
    expenseYen: summary.expenseTotal,
    profitYen: summary.profit,
    profitTrusted: reasons.length === 0,
    untrustedReason: reasons.length === 0 ? null : reasons.join("／"),
  };
}

/** 手で確認した控え（倉庫が読めないとき・日報が無いときはこれを出す） */
export function fallbackStats(): CaseStats {
  return {
    month: CASE_TEBAYA.month,
    days: CASE_TEBAYA.days,
    salesMan: CASE_TEBAYA.salesMan,
    profitMan: CASE_TEBAYA.profitMan,
    checkedOn: CASE_TEBAYA.checkedOn,
    auto: false,
    profitHiddenReason:
      CASE_TEBAYA.profitMan === null ? "手で確認した控えに、確かめた利益の値が無い" : null,
  };
}

/** 前の月の実績を日報から集める。失敗したら控えの数字に戻す（画面は落とさない） */
export async function getCaseStats(today: Date = new Date()): Promise<CaseStats> {
  const { start, label } = previousMonthRange(today);
  const ym = start.slice(0, 7);
  try {
    // ★読む手順は lib/keiri/loadMonthServer.ts の1つだけ。ここで書かない。
    const data = await loadKeiriMonthServer({
      ym,
      businessCode: CASE_BUSINESS_CODE,
      monthOnly: true,
    });
    if (data.reportsUnreadable || data.reports.length === 0) return fallbackStats();

    const figures = summarizeCaseMonth({
      ym,
      rows: data.reports as unknown as ReportRow[],
      advances: data.advances,
      settings: data.settings,
      template: templateFor(CASE_BUSINESS_CODE),
      settingsMissing: data.settingsMissing,
      advancesUnreadable: data.advancesUnreadable,
      ignoreMarks: readIgnoreMarks(data.ignores),
      reportDups: data.reportDups,
    });

    if (figures.days === 0 || figures.salesYen <= 0) return fallbackStats();

    return {
      month: label,
      days: figures.days,
      salesMan: toMan(figures.salesYen),
      profitMan: figures.profitTrusted ? toMan(figures.profitYen) : null,
      checkedOn: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
      auto: true,
      profitHiddenReason: figures.untrustedReason,
    };
  } catch {
    return fallbackStats();
  }
}
