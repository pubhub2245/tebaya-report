import { NextResponse } from "next/server";

import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { previousMonthRange, CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { businessCodeForScope } from "@/lib/tenantScope";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { serverClient } from "@/lib/supabaseServer";
import { probeWarehouseAlive } from "@/lib/keiri/warehouseAlive";

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

  // ★つなぐものは1つ作って、対照と2通りの読みで**同じもの**を使う。
  //   fresh ＝ 前の答えをためずに毎回 取りに行く（2026-11-06・f3-4）
  const db = serverClient({ fresh: true });

  try {
    // ⓪ 対照：同じつなぎ方で手羽屋の行が1件でも見えるか（見えなければ測れない）
    const warehouse = await probeWarehouseAlive(db as any);

    // ★測れないと分かったら、2通りの読みには行きません（白い時間を短くする・kp255）
    if (!warehouse.alive) {
      return jsonWindow({
        month: label,
        ym,
        measurable: false,
        warehouse: { alive: false, state: warehouse.state, reason: warehouse.reason },
        separated: null,
        summary:
          `いまは測れませんでした（${warehouse.reason}）。` +
          "合格にも不合格にもしていません。倉庫が読めるようになってから、もう一度 開いてください",
        note: "読むだけの窓口です。金額・お店の名前・連絡先・鍵の値は1文字も返しません",
      });
    }

    const [mine, other] = await Promise.all([
      loadKeiriMonthServer({ ym, businessCode: CASE_BUSINESS_CODE, monthOnly: true, db }),
      loadKeiriMonthServer({
        ym,
        businessCode: businessCodeForScope(NOBODY),
        scope: NOBODY,
        monthOnly: true,
        db,
      }),
    ]);

    /**
     * いま測れるか（2026-11-06・f3-4）。
     * ★倉庫が読めていないときの「0件」は、分かれている証拠になりません。
     *   それどころか、これまでは **「よそのお店として読んだのに行が出ています」**
     *   という**事実と違う理由**を返していました（行は0件なのに）。
     *   じゅんや検査役がその理由を追いかけても、どこにも見つかりません。
     *   ＝ 測れないときは「測れません」と答えます（合格にも不合格にもしません）。
     */
    const measurable = warehouse.alive && !mine.reportsUnreadable;

    const separated: boolean | null = !measurable
      ? null
      : other.reports.length === 0 &&
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
        /**
         * よその店として読んだとき、**日報いがいの4つの棚を勝手に読み直していないか**
         * （2026-10-19・f3-3・f3-4）。
         *
         * 貼り紙⑪⑫のあと、よその店の行は公開の鍵では「0件」で返ります。
         * 0件をそのまま使うと、数え始めの日・期首残高が既定値に、
         * 給与・金庫・「数えない」の印が空になり、現金残高と利益が黙ってずれます。
         * ＝ 読めなかったときは、読み直さずに「読めません」と返すのが正しい姿です。
         */
        shelvesNotReread:
          other.settingsUnreadable &&
          other.paymentsUnreadable &&
          other.cashUnreadable &&
          other.ignoresUnreadable,
      },
      measurable,
      warehouse: { alive: warehouse.alive, state: warehouse.state, reason: warehouse.reason },
      separated,
      summary: !measurable
        ? `いまは測れませんでした（${warehouse.reason}）。` +
          "合格にも不合格にもしていません。倉庫が読めるようになってから、もう一度 開いてください"
        : separated
        ? `${label}：手羽屋として読むと日報 ${mine.reports.length}件、居ないお店として読むと 0件。` +
          "立替の棚は手羽屋のときだけ読み、よそのお店には読みません（混ざりません）"
        : "分かれていません。よそのお店として読んだのに行が出ています",
      shelves:
        "日報いがいの4つの棚（経理の設定・払った記録・金庫の記録・「数えない」の印）は、" +
        "よその店として読んで答えが返らなかったとき、棚から読み直さずに「読めません」と返します" +
        "（0件を「0円・無し」と取り違えないため）。otherShop.shelvesNotReread がその印です",
      remaining:
        "ブラウザから倉庫を直に読む道（いまの経理画面）は、まだ棚の鍵で守られていません。" +
        "そこは棚の決まりを変える必要があり、ここでは見ていません",
      note: "読むだけの窓口です。金額・お店の名前・連絡先・鍵の値は1文字も返しません",
    });
  } catch {
    return jsonWindow({
      month: label,
      ym,
      measurable: false,
      separated: null,
      summary: "倉庫との通信に失敗したので、確かめられませんでした（合格にも不合格にもしていません）",
      note: "読むだけの窓口です。金額・お店の名前・連絡先・鍵の値は1文字も返しません",
    });
  }
}

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
function jsonWindow(body: unknown): NextResponse {
  return NextResponse.json(stampCheckWindow(body), { status: 200, headers: CHECK_WINDOW_HEADERS });
}
