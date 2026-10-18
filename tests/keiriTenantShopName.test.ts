/**
 * 「申し込んだお店が、自分の名前を画面に出せるか」のテスト（f3-4・kp253／2026-10-18）。
 *
 * ■ ここで固定したいこと
 *   ① 入室したとき・初回設定を終えたときに、お店の名前をブラウザに控える
 *   ② お店が変わったら、控えた名前は必ず捨てる（よその店の名前を出さない）
 *   ③ 手羽屋（印が空）のときは、控えがあっても名前を出さない
 *   ④ 窓口は「在るのに無い」と答えない（公開の鍵で0件なら「確かめられません」）
 *
 * ■ なぜ要るのか（やさしい説明）
 *   お店の棚（keiri_tenants）は鍵がかかっていて、読む決まりが1本もありません。
 *   公開の鍵で聞くと**エラーではなく「0件」**で返るため、名前を聞く窓口は
 *   在るお店まで「ありません」と答えていました。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TENANT_NAME_STORAGE_KEY,
  TENANT_STORAGE_KEY,
  cleanTenantName,
  readTenantName,
  writeTenantName,
  writeTenantScope,
} from "../lib/tenantScope";
import { decideShopNameAnswer, SHOP_NAME_UNCHECKED_MESSAGE } from "../lib/keiri/shopName";

const SHOP_A = "11111111-2222-4333-8444-555555555555";
const SHOP_B = "99999999-8888-4777-8666-555555555555";

function fakeStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/* ---------- ① 控えて読み戻せる ---------- */

test("お店の名前を控えて読み戻せる", () => {
  const store = fakeStore();
  writeTenantScope(SHOP_A, store);
  writeTenantName("テスト広場 本店", store);
  assert.equal(readTenantName(store), "テスト広場 本店");
  assert.equal(store.map.get(TENANT_NAME_STORAGE_KEY), "テスト広場 本店");
});

test("お店の番号を渡しても読み戻せる（画面が番号を持っているとき）", () => {
  const store = fakeStore({ [TENANT_STORAGE_KEY]: SHOP_A });
  writeTenantName("テスト広場", store, SHOP_A);
  assert.equal(readTenantName(store, SHOP_A), "テスト広場");
});

/* ---------- ② お店が変わったら捨てる ---------- */

test("別のお店に入り直すと、前のお店の名前は残らない", () => {
  const store = fakeStore();
  writeTenantScope(SHOP_A, store);
  writeTenantName("Ａ店", store);
  writeTenantScope(SHOP_B, store);
  assert.equal(readTenantName(store), null, "よその店の名前が残っています");
  assert.equal(store.map.has(TENANT_NAME_STORAGE_KEY), false);
});

test("同じお店のまま書き直したときは、控えた名前を消さない", () => {
  const store = fakeStore();
  writeTenantScope(SHOP_A, store);
  writeTenantName("Ａ店", store);
  writeTenantScope(SHOP_A, store);
  assert.equal(readTenantName(store), "Ａ店");
});

test("手羽屋に戻すと、控えた名前も捨てる", () => {
  const store = fakeStore();
  writeTenantScope(SHOP_A, store);
  writeTenantName("Ａ店", store);
  writeTenantScope(null, store);
  assert.equal(store.map.has(TENANT_NAME_STORAGE_KEY), false);
  assert.equal(readTenantName(store), null);
});

/* ---------- ③ 手羽屋には出さない ---------- */

test("印が空（手羽屋）のときは、控えがあっても名前を出さない", () => {
  const store = fakeStore({ [TENANT_NAME_STORAGE_KEY]: "よその店" });
  assert.equal(readTenantName(store), null);
  assert.equal(readTenantName(store, null), null);
});

test("印が空のときは、名前を控えない", () => {
  const store = fakeStore();
  writeTenantName("よその店", store, null);
  assert.equal(store.map.has(TENANT_NAME_STORAGE_KEY), false);
});

/* ---------- 名前の整え方・壊れた控え ---------- */

test("名前は前後の空白を取り、60文字で切る", () => {
  assert.equal(cleanTenantName("  テスト  広場  "), "テスト 広場");
  assert.equal(cleanTenantName(""), null);
  assert.equal(cleanTenantName(null), null);
  assert.equal(cleanTenantName("あ".repeat(80))?.length, 60);
});

test("控えが読めない環境でも落ちない", () => {
  const broken = {
    getItem() {
      throw new Error("プライベートウィンドウでは読めません");
    },
    setItem() {
      throw new Error("書けません");
    },
    removeItem() {
      throw new Error("消せません");
    },
  };
  assert.equal(readTenantName(broken), null);
  assert.doesNotThrow(() => writeTenantName("Ａ店", broken, SHOP_A));
  assert.doesNotThrow(() => writeTenantScope(SHOP_A, broken));
});

/* ---------- ④ 窓口は「在るのに無い」と答えない ---------- */

test("名前が引けたら、そのまま返す", () => {
  const a = decideShopNameAnswer({
    rows: [{ shop_name: "テスト広場" }],
    error: null,
    usedServiceKey: true,
  });
  assert.deepEqual(a, { ok: true, status: 200, shopName: "テスト広場" });
});

test("名前が空のお店でも「ありません」にはしない", () => {
  const a = decideShopNameAnswer({ rows: [{ shop_name: null }], error: null, usedServiceKey: false });
  assert.equal(a.ok, true);
  if (a.ok) assert.equal(a.shopName, null);
});

test("サーバー側の合鍵で聞いて0件なら、ほんとうに無い（404）", () => {
  const a = decideShopNameAnswer({ rows: [], error: null, usedServiceKey: true });
  assert.equal(a.ok, false);
  if (!a.ok) {
    assert.equal(a.status, 404);
    assert.equal(a.unchecked, false);
  }
});

test("公開の鍵で聞いて0件なら「無い」と言い切らない（503・確かめられません）", () => {
  const a = decideShopNameAnswer({ rows: [], error: null, usedServiceKey: false });
  assert.equal(a.ok, false);
  if (!a.ok) {
    assert.equal(a.status, 503);
    assert.equal(a.unchecked, true);
    assert.equal(a.message, SHOP_NAME_UNCHECKED_MESSAGE);
    assert.ok(!a.message.includes("ありません"), "「ありません」と言い切っています");
  }
});

test("不具合が出たときも「無い」と言い切らない", () => {
  const a = decideShopNameAnswer({
    rows: null,
    error: { message: "permission denied" },
    usedServiceKey: true,
  });
  assert.equal(a.ok, false);
  if (!a.ok) assert.equal(a.unchecked, true);
});

/* ---------- 画面側の作りを固定する（取りこぼし防止） ---------- */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("名前を聞く窓口は、サーバー側の合鍵を先に使う", () => {
  const src = read("app/api/keiri/shop/route.ts");
  assert.match(src, /serviceClientOrNull\(\)/);
  assert.match(src, /decideShopNameAnswer/);
});

test("入室したときに、お店の名前を控える（AdminGate）", () => {
  const src = read("app/components/AdminGate.tsx");
  assert.match(src, /writeTenantName\(/);
  assert.match(src, /readTenantName\(/);
});

test("初回設定を終えたときに、お店の名前を控える（/keiri/welcome）", () => {
  const src = read("app/keiri/welcome/page.tsx");
  assert.match(src, /writeTenantName\(/);
});

test("日報とトップは、控えた名前を先に出す", () => {
  assert.match(read("app/report/page.tsx"), /readTenantName\(/);
  assert.match(read("app/components/AppTitle.tsx"), /readTenantName\(/);
});
