/**
 * 「窓口ごしに読めなかったとき、よその店の数字を作らない」かの確かめ
 * （lib/keiri/loadMonth.ts・2026-10-18・kp253 ③・f3-4）。
 *
 * ■ 何を守っているか（やさしい説明）
 *   貼り紙⑪⑫を流すと、経理の設定・払った記録・金庫の記録・「数えない」の印は
 *   「印が空の行だけ 読んでよい」になります。
 *   ブラウザの鍵でそのまま聞くと、よその店の行は**エラーではなく「0件」**で返るので、
 *   数え始めの日・期首残高・給与・金庫の記録が黙って消え、
 *   **現金残高と利益が、まちがったまま画面に出ます**。
 *   ブラウザには合言葉をサーバーのように持たせられないため、
 *   よその店として読んでいて窓口が使えないときは、数字を出さずに止まります。
 *
 * ■ 手羽屋は1行も変わりません
 *   手羽屋（印が空）は、これまでどおり「棚を直に読む道」に戻ります。
 *   戻った先が手羽屋の帳簿そのものなので、よその店の数字は1円も出ません。
 */
import test from "node:test";
import assert from "node:assert/strict";

// 倉庫につなぐ部品が、読み込みのときに住所を求めるので、作り物を渡しておく
// （つなぎません。この確かめでは通信も倉庫も使いません）
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-only-not-a-real-key";

const OTHER_SHOP = "11111111-2222-3333-4444-555555555555";

const FALLBACK_SETTINGS = {
  opening_date: "2026-09-01",
  opening_balance: 0,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

test("よその店として読んでいて窓口が使えないときは、数字を作らずに止まる", async () => {
  const { loadKeiriMonth } = await import("../lib/keiri/loadMonth");

  // 札（合言葉）がこのタブに無く、通信もできない形＝窓口ごしには読めない
  await assert.rejects(
    () =>
      loadKeiriMonth({
        ym: "2026-09",
        scope: OTHER_SHOP,
        businessCode: `t_${OTHER_SHOP}`,
        fallbackSettings: FALLBACK_SETTINGS,
      }),
    (err: unknown) => {
      const msg = String((err as Error)?.message ?? "");
      assert.ok(
        msg.includes("読めませんでした"),
        `「読めませんでした」と正直に言う（出た文：${msg}）`,
      );
      assert.ok(msg.includes("数字を作らない"), "数字を作らないことを文で言う");
      return true;
    },
  );
});

test("手羽屋のときは止めない（棚を直に読む道が残っている）", async () => {
  const mod = await import("../lib/keiri/loadMonth");
  // ★手羽屋は「棚を直に読む道」に戻るので、ここで止める判断は入りません。
  //   実際に倉庫へつなぐと通信が要るので、道が残っていること（関数がある）だけを確かめます。
  assert.equal(typeof mod.loadKeiriMonthDirect, "function");
});
