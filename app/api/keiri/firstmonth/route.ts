import { NextResponse } from "next/server";

import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { buildOneSheet } from "@/lib/keiri/oneSheet";
import {
  buildFirstMonthCheck,
  firstMonthReports,
  firstMonthSettings,
  FIRST_MONTH_SHOP_NAME,
} from "@/lib/keiri/firstMonth";
import { templateFor, TENANT_FALLBACK_SETTINGS } from "@/lib/keiri/index";
import { businessCodeForScope } from "@/lib/tenantScope";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/firstmonth
 *
 * 「初期設定のあと、日報1枚を書いたその日に『今月の利益・今の現金』が出るか」を
 * 外から確かめる窓口（f3-3）。
 *
 * ■ やっていること（2手）
 *   ① 倉庫を**まっさらなお店として**読む … 日報0件・金庫の記録0件＝新しいお店の状態
 *   ② そこへ**架空の日報を1枚だけ**置き、**本物と同じ関数**に1枚の要約を作らせる
 *   → 利益と現金が出るか、別の道で数え直して合うかを返します。
 *
 * ★1行も書き込みません。
 * ★出している金額はすべて架空のお店のもので、手羽屋の実データは1円も入りません。
 * ★手羽屋が毎日使う画面（日報・シフト・レジ・LINE）には触れていません。
 */

/** 居ないお店の番号（作り話）。読むだけなので、どこにも作られません */
const NOBODY = "00000000-0000-4000-8000-000000000000";

/** 日本時間の今日（YYYY-MM-DD）。置いてあるサーバーの時計は日本時間ではないため */
function jstToday(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export async function GET() {
  const reportDate = jstToday();
  const ym = reportDate.slice(0, 7);
  const [y, m] = ym.split("-");
  const monthLabel = `${Number(y)}年${Number(m)}月`;
  const businessCode = businessCodeForScope(NOBODY);
  const template = templateFor(businessCode);

  // ① まっさらなお店として倉庫を読む（読むだけ・件数しか見ない）
  let emptyShop = {
    readable: false,
    reportCount: 0,
    cashEventCount: 0,
    advancesSkipped: false,
  };
  try {
    const data = await loadKeiriMonthServer({
      ym,
      businessCode,
      scope: NOBODY,
      monthOnly: true,
    });
    emptyShop = {
      readable: !data.reportsUnreadable,
      reportCount: data.reports.length,
      cashEventCount: data.cashEvents.length,
      advancesSkipped: data.advancesSkipped === true,
    };
  } catch {
    // 読めなかったことは、下の判定で「合格にしない」形で表に出ます
  }

  // ② そこへ架空の日報を1枚だけ置いて、本物と同じ関数に1枚を作らせる
  const reports = firstMonthReports(reportDate);
  const common = {
    ym,
    monthLabel,
    shopName: FIRST_MONTH_SHOP_NAME,
    reports,
    payments: [],
    advances: [],
    template,
    madeOn: reportDate,
    cashEvents: [],
  };
  const withSetup = buildOneSheet({ ...common, settings: firstMonthSettings(reportDate) });
  // 設定がまだ読めないとき（保険の値）でも、払っていない家賃・外注費を作らないこと
  const withoutSetup = buildOneSheet({ ...common, settings: TENANT_FALLBACK_SETTINGS });

  const result = buildFirstMonthCheck({
    month: monthLabel,
    ym,
    reportDate,
    emptyShop,
    withSetup,
    withoutSetup,
  });

  return NextResponse.json(stampCheckWindow(result), { status: 200, headers: CHECK_WINDOW_HEADERS });
}
