/**
 * 「その月の限定商品は、どのお店のときに読み書きするか」のテスト（2026-10-24・f3-4）。
 *
 * ここが外れると、
 *   ・よその店の日報の入力画面に**手羽屋が決めた商品の名前と単価が出る**
 *   ・そのお店の売上の内訳に、売っていない商品の行が混ざる（数字が狂う）
 * ので、手羽屋のときは1つも変わらないことと合わせて固定しておく。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  limitedProductInScope,
  LIMITED_PRODUCT_OUT_OF_SCOPE,
} from "../lib/limitedProductScope";

const SHOP = "11111111-2222-4333-8444-555555555555";

test("手羽屋（印が空）のときは今までどおり読み書きする", () => {
  assert.equal(limitedProductInScope(null), true);
  // 形の違う値は手羽屋に倒れる（lib/tenantScope.ts と同じ決め方）
  assert.equal(limitedProductInScope(""), true);
  assert.equal(limitedProductInScope("tebaya"), true);
});

test("よその店のときは読まない・書かない", () => {
  assert.equal(limitedProductInScope(SHOP), false);
  assert.equal(limitedProductInScope(SHOP.toUpperCase()), false);
});

test("断るときは、黙って何もしないのではなく理由を返す", () => {
  assert.ok(LIMITED_PRODUCT_OUT_OF_SCOPE.length > 0);
  assert.ok(LIMITED_PRODUCT_OUT_OF_SCOPE.includes("手羽屋"));
});

test("限定商品の棚を読む・書く3か所すべてに門が掛かっている", () => {
  const src = readFileSync("lib/limitedProduct.ts", "utf8");
  // 倉庫に触る所（.from(...)）の手前に、必ず門の判定があること
  const gates = src.match(/limitedProductInScope\(scope\)/g) ?? [];
  assert.equal(
    gates.length,
    3,
    "読む2か所と書く1か所の、どれかで門が外れています",
  );
  for (const fn of [
    "getLimitedProductForMonth",
    "listLimitedProducts",
    "upsertLimitedProduct",
  ]) {
    const at = src.indexOf(`export async function ${fn}`);
    assert.ok(at > 0, `${fn} が見つかりません`);
    const body = src.slice(at, src.indexOf("\n}\n", at));
    const gate = body.indexOf("limitedProductInScope(scope)");
    const touch = body.indexOf('.from("monthly_limited_products")');
    assert.ok(gate > 0, `${fn} に門がありません`);
    if (touch > 0) {
      assert.ok(gate < touch, `${fn} は門より先に倉庫を読んでいます`);
    }
  }
});

test("いまどのお店かは、日報の保存とまったく同じ安全側の決め方で読む", () => {
  const src = readFileSync("lib/limitedProduct.ts", "utf8");
  assert.ok(
    src.includes('import { currentShopScope } from "./keiri/readSource"'),
    "currentShopScope（入室の印と端末の控えの両方を見る決め方）を使っていません",
  );
  assert.equal(
    (src.match(/scope: TenantScope = currentShopScope\(\)/g) ?? []).length,
    3,
    "3か所すべてで同じ決め方になっていません",
  );
});
