import { NextResponse } from "next/server";

import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { previousMonthRange, CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { applyTenantScope, businessCodeForScope, TEBAYA_SCOPE } from "@/lib/tenantScope";
import { PHOTO_SHOPS } from "@/lib/photoShop";
import {
  calcRealSeparation,
  monthRangeJst,
  type RealSeparation,
  type StampedRow,
} from "@/lib/keiri/realTenantSeparation";
import {
  calcMasterShelfSeparation,
  type MasterShelfRead,
  type MasterShelfSeparation,
} from "@/lib/keiri/masterShelfSeparation";
import { MASTER_SHELF_TABLES } from "@/lib/keiri/shelfScope";
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
 * ★同じ月を**3通り**で読んで、件数だけを見比べます。
 *   ① 手羽屋として（印が空）… いまの画面と同じ読み方
 *   ② 居ないお店として（作り話の番号）… 1件も出ないのが正しい
 *   ③ **本物の2軒目として**（lib/photoShop.ts の一覧にあるお店）…
 *      2026-11-11 追加（realShop）。②は分けるしくみが1つも動いていなくても必ず0件なので、
 *      あれだけでは「分かれている証拠」になりません。本物の行で混ざりを数えます。
 *      その店の番号はコードの中にあるので、倉庫の鍵が壊れていても確かめられます。
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

    // ③ 本物の2軒目で、行が混ざっていないかを数える（2026-11-11・f3-4）
    const realShop = await readRealShopSeparation(db, measurable);

    /**
     * ④ 選択肢の棚（出店場所・担当者・商品と単価）でも同じ数え方をする（2026-11-13・f3-4）。
     *   ★日報の棚には よその店の行がまだ1件も無いので、③だけでは
     *     「手羽屋として読むと よその店の行が出てこないか」を**本物の行で**確かめられません。
     *     選択肢の棚には もう本物の行が入っているので、きょう確かめられます。
     */
    const masters = await readMasterShelfSeparation(db, measurable);

    return jsonWindow({
      month: label,
      ym,
      tebaya: {
        reportCount: mine.reports.length,
        advancesRead: !mine.advancesSkipped,
        advanceCount: mine.advances.length,
        readable: !mine.reportsUnreadable,
        /**
         * ★reportCount は**棚にある行をそのまま数えた数**です（2026-11-11・f1-4）。
         *   月の締めが数える枚数とは**わざと違います**。締めは「同じ日の入れ直し」と
         *   見た組を1枚だけ数えるので、こちらより少なくなることがあります
         *   （2026年10月は 棚に15件・締めは13件。差の2件は同じ日の入れ直し）。
         *   ＝ 2つの窓口で数が違っても、食い違いではありません。
         *   締めの枚数は /api/keiri/selfcheck の reportCount（と sameReportMarks）を見てください。
         */
        countMeans:
          "棚にある行をそのまま数えた数です。月の締めが数える枚数（/api/keiri/selfcheck の " +
          "reportCount）は、「同じ日の入れ直し」と見た組を1枚だけ数えるので、これより少なくなる" +
          "ことがあります。数が違っても食い違いではありません（その内訳は selfcheck の " +
          "sameReportMarks に出ます）",
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
      realShop: { ...realShop, masters },
      /**
       * 本物の行で確かめられた向きの数を、**日報いがいの棚もあわせて**数えたもの
       * （2026-11-13・f3-4）。realShop.provenDirections（日報だけ）は変えていません。
       */
      provenDirectionsAnyShelf:
        (realShop.provenOtherShopHidesTebaya ? 1 : 0) +
        (realShop.provenTebayaHidesOtherShop || masters.provenTebayaHidesOtherShop ? 1 : 0),
      summary: !measurable
        ? `いまは測れませんでした（${warehouse.reason}）。` +
          "合格にも不合格にもしていません。倉庫が読めるようになってから、もう一度 開いてください"
        : separated
        ? `${label}：手羽屋として読むと日報 ${mine.reports.length}件、居ないお店として読むと 0件。` +
          "立替の棚は手羽屋のときだけ読み、よそのお店には読みません（混ざりません）。" +
          `【本物の2軒目でも数えました】${realShop.summary}` +
          `【選択肢の棚でも数えました】${masters.summary}`
        : "分かれていません。よそのお店として読んだのに行が出ています",
      shelves:
        "日報いがいの4つの棚（経理の設定・払った記録・金庫の記録・「数えない」の印）は、" +
        "よその店として読んで答えが返らなかったとき、棚から読み直さずに「読めません」と返します" +
        "（0件を「0円・無し」と取り違えないため）。otherShop.shelvesNotReread がその印です",
      realShopNote:
        "realShop は、**本物の2軒目のお店**（lib/photoShop.ts の一覧）として今月を読み直し、" +
        "行が混ざっていないかを数えた結果です。separated が true でも、" +
        "realShop.measuredAgainstRealRows が false のときは『その店の行がこの月にまだ無い』という" +
        "意味で、**2つの向きの両方を確かめたわけではありません**（分かれている証拠としては半分です）。" +
        "向きごとの強さは provenDirections（0〜2）と strengthNote を見てください：" +
        "provenOtherShopHidesTebaya が true なら『よその店として読むと、この月に本当に有る手羽屋の行が" +
        "1件も出てこない』ところまでは**本物の行で確かめた**という意味です" +
        "（絞っていなければ そのまま出てくる行なので、居ないお店の番号で読んだ0件より強い証拠です）。" +
        "provenTebayaHidesOtherShop は逆向きで、その店が日報を1枚でも出すまで true になりません。" +
        "0 が正しい数は4つ：手羽屋の読みに混ざった印つきの行／よその店の読みに混ざった印が空の行／" +
        "よその店の読みに混ざった別の店の行／両方に出てきた同じ行。" +
        "お店の名前・番号・金額は1文字も返しません",
      mastersNote:
        "realShop.masters は、**選択肢の棚**（出店場所・担当者・商品と単価）を同じ数え方で" +
        "数えたものです（2026-11-13）。日報の棚には よその店の行がまだ1件も無いので、" +
        "『手羽屋として読むと よその店の行が出てこないか』は日報では確かめられません。" +
        "選択肢の棚には **よその店の本物の行がもう入っている**ので、そちらで確かめます。" +
        "provenDirectionsAnyShelf は、その結果もあわせて数えた向きの数（0〜2）です" +
        "（realShop.provenDirections は日報だけの数え方のままです）。" +
        "ここで見ているのは**アプリが読むときの絞り**だけで、公開の鍵で直に読む道" +
        "（/api/keiri/copies・貼り紙⑬）は見ていません",
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

/**
 * 本物の2軒目として今月を読み直し、行が混ざっていないかを数える。
 *
 * ★読むのは日報の「行の番号」と「どの店の印か」の2つだけ（金額は1円も読みません）。
 * ★お店が1軒も登録されていない・読めなかったときは「数えられません」で返します
 *   （0件を「分かれている」と取り違えないため）。
 */
async function readRealShopSeparation(db: any, measurable: boolean): Promise<RealSeparation & { ym: string }> {
  const { start, end, ym } = monthRangeJst(new Date());
  const shop = PHOTO_SHOPS[0];

  const empty = (summary: string): RealSeparation & { ym: string } => ({
    ym,
    measuredAgainstRealRows: false,
    provenOtherShopHidesTebaya: false,
    provenTebayaHidesOtherShop: false,
    provenDirections: 0,
    strengthNote: "いまは数えられませんでした（どちらの向きも確かめていません）",
    tebayaRows: 0,
    otherShopRows: 0,
    strayStampedInTebaya: 0,
    strayTebayaInOtherShop: 0,
    strayWrongShopInOtherShop: 0,
    overlap: 0,
    separated: null,
    summary,
  });

  if (!measurable) return empty("いまは数えられませんでした（倉庫が読めていません）");
  if (!shop) {
    return empty(
      "本物の2軒目のお店がまだ1軒も登録されていないので、数えられませんでした" +
        "（lib/photoShop.ts の一覧が空です）",
    );
  }

  const read = (scope: string | null) =>
    applyTenantScope<any>(
      db
        .from("daily_reports")
        .select("id, tenant_id")
        .gte("date", start)
        .lte("date", end) as any,
      scope,
    );

  try {
    const [mine, theirs] = await Promise.all([read(TEBAYA_SCOPE), read(shop.tenantId)]);
    if (mine?.error || theirs?.error) {
      return empty("日報を読めなかったので、数えられませんでした（合格にも不合格にもしていません）");
    }
    return {
      ym,
      ...calcRealSeparation({
        measurable: true,
        tebaya: (mine?.data ?? []) as StampedRow[],
        otherShop: (theirs?.data ?? []) as StampedRow[],
        otherShopId: shop.tenantId,
      }),
    };
  } catch {
    return empty("日報を読むときに通信が途切れたので、数えられませんでした");
  }
}

/**
 * 選択肢の棚（出店場所・担当者・商品と単価）を2通りで読み、行が混ざっていないかを数える。
 *
 * ★読むのは「行の番号」と「どの店の印か」の2つだけ（名前・金額・連絡先は1文字も読みません）。
 * ★1行も書き込みません。読めなかった棚は「漏れていない」に寄せず、読めなかったと数えます。
 */
async function readMasterShelfSeparation(
  db: any,
  measurable: boolean,
): Promise<MasterShelfSeparation> {
  const shop = PHOTO_SHOPS[0];
  const labels: Record<string, string> = {
    locations: "出店場所",
    staff_members: "担当者",
    sale_products: "商品と単価",
  };
  const blank = (): MasterShelfRead[] =>
    MASTER_SHELF_TABLES.map((table) => ({
      table,
      label: labels[table] ?? table,
      readable: false,
      tebaya: [],
      otherShop: [],
    }));

  if (!measurable || !shop) {
    return calcMasterShelfSeparation({
      shelves: blank(),
      otherShopId: shop?.tenantId ?? "",
    });
  }

  const read = (table: string, scope: string | null) =>
    applyTenantScope<any>(
      db.from(table).select("id, tenant_id").limit(1000) as any,
      scope,
    );

  const shelves: MasterShelfRead[] = await Promise.all(
    MASTER_SHELF_TABLES.map(async (table) => {
      const label = labels[table] ?? table;
      try {
        const [mine, theirs] = await Promise.all([
          read(table, TEBAYA_SCOPE),
          read(table, shop.tenantId),
        ]);
        if (mine?.error || theirs?.error) {
          return { table, label, readable: false, tebaya: [], otherShop: [] };
        }
        return {
          table,
          label,
          readable: true,
          tebaya: (mine?.data ?? []) as MasterShelfRead["tebaya"],
          otherShop: (theirs?.data ?? []) as MasterShelfRead["otherShop"],
        };
      } catch {
        return { table, label, readable: false, tebaya: [], otherShop: [] };
      }
    }),
  );

  return calcMasterShelfSeparation({ shelves, otherShopId: shop.tenantId });
}

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
function jsonWindow(body: unknown): NextResponse {
  return NextResponse.json(stampCheckWindow(body), { status: 200, headers: CHECK_WINDOW_HEADERS });
}
