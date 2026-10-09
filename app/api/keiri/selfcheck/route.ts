import { NextResponse, type NextRequest } from "next/server";

import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { buildOneSheet } from "@/lib/keiri/oneSheet";
import { buildSelfCheck, unreadableSelfCheck } from "@/lib/keiri/selfCheck";
import { previousMonthRange, CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { templateFor } from "@/lib/keiri/index";
import { CHECK_WINDOW_HEADERS } from "@/lib/keiri/checkWindow";

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
 *
 * ■ 月を指定できます（2026-10-09・検査役 B2 の気づきから）
 *   `?ym=2026-08` のように付けると、**その月**で締め直して答えます。
 *   付けなければ今までどおり**前の月**です。
 *   それまでは何月を指定しても前の月の答えが返っていたため、
 *   外からは「今月ぶんや、もっと前の月が正しく締まるか」を確かめられませんでした。
 */
export async function GET(req: NextRequest) {
  const asked = (req.nextUrl.searchParams.get("ym") ?? "").trim();
  const { start } = previousMonthRange(new Date());
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : start.slice(0, 7);
  const label = monthLabelOf(ym);
  try {
    const data = await loadKeiriMonthServer({ ym, businessCode: CASE_BUSINESS_CODE });
    if (data.reportsUnreadable) {
      return jsonWindow(
        unreadableSelfCheck({ month: label, ym, reason: "日報の棚が読めませんでした" }),
      );
    }
    if (data.advancesUnreadable) {
      return jsonWindow(
        unreadableSelfCheck({
          month: label,
          ym,
          reason: "立て替えて払った経費の棚が読めませんでした（経費がまるごと落ちるので数えません）",
        }),
      );
    }
    if (data.reports.length === 0) {
      return jsonWindow(
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

    return jsonWindow(buildSelfCheck({ month: label, ym, sheet }));
  } catch {
    return jsonWindow(
      unreadableSelfCheck({ month: label, ym, reason: "倉庫との通信に失敗しました" }),
    );
  }
}

/**
 * 「2026年9月」の形の見出し。
 * ★前の月のときの書き方（previousMonthRange の label）と同じ形にそろえてあります。
 */
function monthLabelOf(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return `${Number(m[1])}年${Number(m[2])}月`;
}

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
function jsonWindow(body: unknown): NextResponse {
  return NextResponse.json(body, { status: 200, headers: CHECK_WINDOW_HEADERS });
}
