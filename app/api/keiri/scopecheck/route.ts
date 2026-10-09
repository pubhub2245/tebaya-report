import { NextResponse } from "next/server";

import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { previousMonthRange, CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { businessCodeForScope } from "@/lib/tenantScope";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/scopecheck
 *
 * 「お店ごとに分かれているか（よその店のものが混ざらないか）」を
 * 外から確かめる窓口（f3-4・kp239）。
 *
 * ★同じ月を**2通り**で読んで、件数だけを見比べます。
 *   ① 手羽屋として（印が空）… いまの画面と同じ読み方
 *   ② 居ないお店として（作り話の番号）… 1件も出ないのが正しい
 * ★**1行も書き込みません。金額・お店の名前・連絡先・鍵の値は1文字も返しません。**
 * ★手羽屋が毎日使う画面（日報・シフト・レジ・LINE）には触れていません。
 *
 * ■ ここで分かること・分からないこと（正直に）
 *   分かる … サーバー側で読むとき、よその店の番号では手羽屋の行が1件も出ないこと。
 *            立替の2つの棚（まだ「どの店か」の欄が無い）を、よその店には読まないこと。
 *   分からない … ブラウザから倉庫を直に読む道（いまの経理画面）までは、ここでは見ていません。
 *            そちらは棚の鍵の決まりを変える必要があり、まだ残っています。
 */

/** 居ないお店の番号（作り話）。読むだけなので、どこにも作られません */
const NOBODY = "00000000-0000-4000-8000-000000000000";

export async function GET() {
  const { start, label } = previousMonthRange(new Date());
  const ym = start.slice(0, 7);

  try {
    const [mine, other] = await Promise.all([
      loadKeiriMonthServer({ ym, businessCode: CASE_BUSINESS_CODE, monthOnly: true }),
      loadKeiriMonthServer({
        ym,
        businessCode: businessCodeForScope(NOBODY),
        scope: NOBODY,
        monthOnly: true,
      }),
    ]);

    const separated =
      !mine.reportsUnreadable &&
      other.reports.length === 0 &&
      other.advances.length === 0 &&
      other.advancesSkipped === true;

    return jsonWindow({
      month: label,
      ym,
      tebaya: {
        reportCount: mine.reports.length,
        advancesRead: !mine.advancesSkipped,
        advanceCount: mine.advances.length,
        readable: !mine.reportsUnreadable,
      },
      otherShop: {
        reportCount: other.reports.length,
        advancesRead: !other.advancesSkipped,
        advanceCount: other.advances.length,
      },
      separated,
      summary: separated
        ? `${label}：手羽屋として読むと日報 ${mine.reports.length}件、居ないお店として読むと 0件。` +
          "立替の棚は手羽屋のときだけ読み、よそのお店には読みません（混ざりません）"
        : "分かれていません。よそのお店として読んだのに行が出ています",
      remaining:
        "ブラウザから倉庫を直に読む道（いまの経理画面）は、まだ棚の鍵で守られていません。" +
        "そこは棚の決まりを変える必要があり、ここでは見ていません",
      note: "読むだけの窓口です。金額・お店の名前・連絡先・鍵の値は1文字も返しません",
    });
  } catch {
    return jsonWindow({
      month: label,
      ym,
      separated: false,
      summary: "倉庫との通信に失敗したので、確かめられませんでした",
      note: "読むだけの窓口です。金額・お店の名前・連絡先・鍵の値は1文字も返しません",
    });
  }
}

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
function jsonWindow(body: unknown): NextResponse {
  return NextResponse.json(stampCheckWindow(body), { status: 200, headers: CHECK_WINDOW_HEADERS });
}
