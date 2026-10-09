import { cannot, describe } from "../describe";

import { activateTenantViaRpc } from "@/lib/keiri/tenantAccess";
import { generateAdminPassword, generateSetupToken, hashSecret } from "@/lib/keiri/tenants";
import { TEST_SHOP } from "@/lib/keiri/tenantTrial";
import {
  SHOP_COLUMNS,
  findTestShop,
  peekTestShop,
  setupElapsedMs,
  type TestShopRow,
} from "@/lib/keiri/tenantTrialServer";
import { serviceClientOrNull } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/keiri/tenant-trial/run
 *
 * テストの店（架空の1軒）を作って、初回設定まで済ませる（f5-4・手順1〜3）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   2軒目を入れる6手のうち、手順1「お店の行を1つ作る」だけが
 *   倉庫（Supabase）の画面を開ける人にしかできませんでした。
 *   お店の棚はブラウザから読めも書けもしない決まりで、作る命令も
 *   「流す人の権限で動く」形だからです。そのため**テスト用の店を1軒も作れず**、
 *   手順を端から端まで通した記録が0件のままでした。
 *   ここでは、その手順1をサーバーの中（仕組み側の鍵）で行います。
 *
 * ■ 作れるのは固定の1軒だけです
 *   店名・数え始めの日・金庫の起点は lib/keiri/tenantTrial.ts に書いた固定の値で、
 *   **外から指定できません**。一意の目印を使っているので、何度 送っても増えません
 *   （2回目からは「もうありました」と返すだけ）。
 *   ＝「好きな名前のお店をいくらでも作れる窓口」ではありません
 *   （2026-09-19 に一度 開いて閉じた形には戻していません）。
 *
 * ■ 作るもの・作らないもの
 *   作る   … お店の棚に1行（名前の頭に【テスト】が付く）、そのお店ぶんの経理の設定に1行
 *   作らない … 日報・経費・申し込みの行は**1行も作りません**
 *   手羽屋は印が空のお店なので、毎日使う画面（日報・シフト・レジ・LINE）は何も変わりません。
 *
 * ■ 管理画面の合言葉
 *   ここで作ってその場で戻せない形にし、**生の値はどこにも残しません・返しません**。
 *   ＝このテストの店には誰も入れません（外から覗かれる心配がありません）。
 */
export async function POST() {
  // ★まず「もうあるか」を鍵なしでも見る（貼り紙⑥が作っていることがある）
  const already = await peekTestShop();
  if (already.kind === "row" && already.row.viaSettings) {
    return describe({
      state: { exists: true, createdNow: false, active: true, settingsReady: true },
      tenantId: already.row.id,
      elapsedMs: null,
      ran: "もうありました（貼り紙⑥が作っています）。何も作っていません",
      via: "sheet",
    });
  }

  const db = serviceClientOrNull();
  if (!db) {
    return cannot(
      "仕組み側の鍵が使えないので、ここでは作れませんでした。" +
        "/keiri/sql の貼り紙（⑥）を1回 貼ると、鍵を待たずにテストの店ができます",
    );
  }

  const startedAt = Date.now();
  const first = await findTestShop(db);
  if (first.kind === "nokey" || first.kind === "error") {
    return cannot("倉庫との通信に失敗したので、テストの店を作れませんでした");
  }

  let shop: TestShopRow | null = first.kind === "row" ? first.row : null;
  let createdNow = false;

  if (!shop) {
    const { data, error } = await db
      .from("keiri_tenants")
      .insert({
        shop_name: null,
        template: "generic",
        setup_token: generateSetupToken(),
        source: "manual",
        status: "pending",
        // ★一意の欄に目印を入れる＝何度 送っても2軒目はできない
        external_session_id: TEST_SHOP.mark,
        external_customer_id: TEST_SHOP.mark,
      })
      .select(SHOP_COLUMNS)
      .maybeSingle();
    if (!error && data) {
      shop = data as unknown as TestShopRow;
      createdNow = true;
    } else {
      // 同時に2回 送られて、もう作られていたときはそれを使う
      const again = await findTestShop(db);
      if (again.kind !== "row") {
        return cannot("テストの店を作れませんでした（倉庫が断りました）");
      }
      shop = again.row;
    }
  }

  let settingsReady = shop.status === "active";
  if (shop.status === "pending") {
    const result = await activateTenantViaRpc(db, {
      token: shop.setup_token,
      session: "",
      shopName: TEST_SHOP.name,
      openingDate: TEST_SHOP.openingDate,
      openingBalance: TEST_SHOP.openingBalance,
      adminPasswordHash: hashSecret(generateAdminPassword()),
    });
    if (result.outcome === "ok") settingsReady = result.settingsOk;
  }

  const after = await findTestShop(db);
  const fresh: TestShopRow = after.kind === "row" ? after.row : shop;

  return describe({
    state: {
      exists: true,
      createdNow,
      active: fresh.status === "active",
      settingsReady,
    },
    tenantId: fresh.id,
    elapsedMs: setupElapsedMs(fresh.created_at, fresh.activated_at) ?? Date.now() - startedAt,
    ran: createdNow
      ? "この回で1軒 作って、初回設定まで済ませました"
      : "もうありました。何も作っていません",
  });
}
