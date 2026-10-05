import { NextResponse } from "next/server";

import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { buildOneSheet } from "@/lib/keiri/oneSheet";
import { buildSelfCheck, unreadableSelfCheck } from "@/lib/keiri/selfCheck";
import { previousMonthRange, CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { templateFor } from "@/lib/keiri/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/selfcheck
 *
 * 「前の月の締めが、人の手を借りずに正しく出たか」を外から確かめる窓口（f1-5・f1-2）。
 *
 * ★本物のデータで、**本物と同じ関数**（buildOneSheet）に1枚を作らせ、
 *   その検算の結果（○／×）だけを返します。
 * ★1行も書き込みません。金額・お店の名前・連絡先・鍵の値は1文字も返しません。
 * ★手羽屋が毎日使う画面（日報・シフト・レジ・LINE）には触れていません。
 */
export async function GET() {
  const { start, label } = previousMonthRange(new Date());
  const ym = start.slice(0, 7);
  try {
    const data = await loadKeiriMonthServer({ ym, businessCode: CASE_BUSINESS_CODE });
    if (data.reportsUnreadable) {
      return NextResponse.json(
        unreadableSelfCheck({ month: label, ym, reason: "日報の棚が読めませんでした" }),
      );
    }
    if (data.advancesUnreadable) {
      return NextResponse.json(
        unreadableSelfCheck({
          month: label,
          ym,
          reason: "立て替えて払った経費の棚が読めませんでした（経費がまるごと落ちるので数えません）",
        }),
      );
    }
    if (data.reports.length === 0) {
      return NextResponse.json(
        unreadableSelfCheck({ month: label, ym, reason: "その月の日報が1件もありません" }),
      );
    }

    const sheet = buildOneSheet({
      ym,
      monthLabel: label,
      shopName: "",
      reports: data.reports,
      payments: data.payments,
      advances: data.advances,
      settings: data.settings,
      template: templateFor(CASE_BUSINESS_CODE),
      cashEvents: data.cashEvents,
    });

    return NextResponse.json(buildSelfCheck({ month: label, ym, sheet }));
  } catch {
    return NextResponse.json(
      unreadableSelfCheck({ month: label, ym, reason: "倉庫との通信に失敗しました" }),
    );
  }
}
