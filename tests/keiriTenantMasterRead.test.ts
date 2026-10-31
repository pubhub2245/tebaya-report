/**
 * 「テストの店の出店場所」を読む道（lib/keiri/tenantMasterRead.ts）を縛るテスト。
 *
 * ■ なぜ要るか（2026-10-29・kp266／f3-4・f5-4）
 *   貼り紙⑬のあと、テストの店の出店場所は公開の鍵では読めなくなる。
 *   ここを直さないと、通す側が「まだ無い」と思って**同じ行をもう1件 足す**。
 *   流す前（窓口なし）と流したあと（窓口あり）で、**同じ答え**が出ることを固定する。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  findTestShopLocation,
  findTestShopProduct,
  findTestShopStaff,
  mergeWindowWages,
  namesFromWindowRows,
  saleProductsFromWindowRows,
  staffWagesFromWindowRows,
} from "../lib/keiri/tenantMasterRead";
import {
  TENANT_LOCATIONS_WINDOW,
  TENANT_PRODUCTS_WINDOW,
  TENANT_STAFF_WINDOW,
} from "../lib/keiri/shelfScope";
import { TEST_SHOP } from "../lib/keiri/tenantTrial";

const TENANT = "11111111-2222-3333-4444-555555555555";
const NAME = "【テスト】テスト広場";
const PRODUCT = "【テスト】テスト商品";

/** 倉庫のふり（窓口の答えと、公開の鍵の答えを好きに決められる） */
function fakeDb(opts: {
  window?: { data?: unknown; error?: any };
  anonRows?: unknown[];
  anonError?: any;
}) {
  const calls: { rpc: Record<string, unknown>[]; from: string[] } = { rpc: [], from: [] };
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, ...args });
      return opts.window ?? { data: null, error: { code: "PGRST202" } };
    },
    from: (table: string) => {
      calls.from.push(table);
      const q: any = {
        select: () => q,
        is: () => q,
        eq: () => q,
        limit: async () => ({ data: opts.anonRows ?? [], error: opts.anonError ?? null }),
      };
      return q;
    },
  };
  return { db, calls };
}

test("窓口があれば、窓口ごしに読む（公開の鍵は使わない）", async () => {
  const { db, calls } = fakeDb({ window: { data: [{ id: 1, name: NAME }], error: null } });
  const r = await findTestShopLocation(db as any, TENANT, NAME);
  assert.deepEqual(r, { found: true, unreadable: false, via: "window" });
  assert.equal(calls.from.length, 0, "窓口があるのに公開の鍵でも読んでいます");
  assert.equal(calls.rpc[0]?.fn, TENANT_LOCATIONS_WINDOW);
  // お店の番号は渡さない（渡すと、名乗っただけで読めることになる）
  assert.ok(!("p_tenant_id" in (calls.rpc[0] ?? {})), "お店の番号を渡しています");
  assert.equal(calls.rpc[0]?.p_test_mark, TEST_SHOP.mark);
});

test("窓口はあるが、その名前の出店場所がまだ無いときは found=false", async () => {
  const { db } = fakeDb({ window: { data: [{ id: 1, name: "ほかの場所" }], error: null } });
  const r = await findTestShopLocation(db as any, TENANT, NAME);
  assert.equal(r.found, false);
  assert.equal(r.unreadable, false);
});

test("窓口がまだ無い（貼り紙を流す前）なら、今までどおり公開の鍵で読む", async () => {
  const { db, calls } = fakeDb({
    window: { data: null, error: { code: "PGRST202", message: "Could not find the function" } },
    anonRows: [{ id: 7 }],
  });
  const r = await findTestShopLocation(db as any, TENANT, NAME);
  assert.deepEqual(r, { found: true, unreadable: false, via: "anon" });
  assert.deepEqual(calls.from, ["locations"]);
});

test("窓口が「窓口が無い」以外の理由で断ったら、読めなかったと言う（勝手に0件にしない）", async () => {
  const { db, calls } = fakeDb({ window: { data: null, error: { code: "42501", message: "denied" } } });
  const r = await findTestShopLocation(db as any, TENANT, NAME);
  assert.equal(r.unreadable, true);
  assert.equal(r.found, false);
  assert.equal(calls.from.length, 0, "断られたのに公開の鍵で読み直しています");
});

test("公開の鍵でも読めなければ、読めなかったと言う", async () => {
  const { db } = fakeDb({
    window: { data: null, error: { code: "PGRST202" } },
    anonError: { message: "ng" },
  });
  const r = await findTestShopLocation(db as any, TENANT, NAME);
  assert.equal(r.unreadable, true);
  assert.equal(r.found, false);
});

test("窓口の答えの形が変わっても落ちない", () => {
  assert.deepEqual(namesFromWindowRows(null), []);
  assert.deepEqual(namesFromWindowRows([{ name: "あ" }, { x: 1 }, null, { name: 3 }]), ["あ"]);
});

/* ================================================================== *
 *  商品（名前と単価）も同じ道で読む（2026-10-30・kp269／f5-4・f3-4）
 * ================================================================== */

test("商品も窓口ごしに読む（公開の鍵は使わない・単価も返る）", async () => {
  const { db, calls } = fakeDb({
    window: { data: [{ id: 3, name: PRODUCT, price: 500, kind: "primary", is_active: true }], error: null },
  });
  const r = await findTestShopProduct(db as any, TENANT, PRODUCT);
  assert.deepEqual(r, { found: true, price: 500, unreadable: false, via: "window" });
  assert.equal(calls.from.length, 0, "窓口があるのに公開の鍵でも読んでいます");
  assert.equal(calls.rpc[0]?.fn, TENANT_PRODUCTS_WINDOW);
  assert.ok(!("p_tenant_id" in (calls.rpc[0] ?? {})), "お店の番号を渡しています");
  assert.equal(calls.rpc[0]?.p_test_mark, TEST_SHOP.mark);
});

test("窓口がまだ無いときは、今までどおり公開の鍵で読む（流す前と同じ答え）", async () => {
  const { db, calls } = fakeDb({ anonRows: [{ id: 3, price: 500 }] });
  const r = await findTestShopProduct(db as any, TENANT, PRODUCT);
  assert.equal(r.found, true);
  assert.equal(r.price, 500);
  assert.equal(r.via, "anon");
  assert.deepEqual(calls.from, ["sale_products"]);
});

test("読めなかったら『無い』と言わない（同じ商品を2件 足さないため）", async () => {
  const { db } = fakeDb({ window: { data: null, error: { code: "42501", message: "permission denied" } } });
  const r = await findTestShopProduct(db as any, TENANT, PRODUCT);
  assert.equal(r.found, false);
  assert.equal(r.unreadable, true);
});

test("窓口の答えを、日報の画面が使える形に直す（お店は開いている方を入れる）", () => {
  const rows = [
    { id: 2, name: "B", price: "300", kind: "normal", is_active: true, sort_order: 2 },
    { id: 1, name: "A", price: 500, kind: "primary", is_active: true, sort_order: 1 },
    { id: 9, name: "やめた商品", price: 100, kind: "normal", is_active: false, sort_order: 0 },
    { id: 8, price: 100 },
  ];
  const out = saleProductsFromWindowRows(rows, "手羽屋");
  assert.deepEqual(
    out.map((p) => [p.name, p.price, p.kind, p.shop, p.sort_order]),
    [
      ["A", 500, "primary", "手羽屋", 1],
      ["B", 300, "normal", "手羽屋", 2],
    ],
  );
});

test("窓口が何も返さないときは空（『1件もない』と見せない判断は呼ぶ側）", () => {
  assert.deepEqual(saleProductsFromWindowRows(null, "手羽屋"), []);
  assert.deepEqual(saleProductsFromWindowRows([], "手羽屋"), []);
});


/* ================================================================== *
 *  担当者（名前と日当）も同じ道で読む（2026-10-31・kp270／f5-4・f3-4）
 * ================================================================== */

const STAFF = "【テスト】テスト太郎";

test("担当者も窓口ごしに読む（公開の鍵は使わない・日当も返る）", async () => {
  const { db, calls } = fakeDb({
    window: {
      data: [{ id: 5, name: STAFF, daily_wage: 10000, is_active: true }],
      error: null,
    },
  });
  const r = await findTestShopStaff(db as any, TENANT, STAFF);
  assert.deepEqual(r, { found: true, dailyWage: 10000, unreadable: false, via: "window" });
  assert.equal(calls.from.length, 0, "窓口があるのに公開の鍵でも読んでいます");
  assert.equal(calls.rpc[0]?.fn, TENANT_STAFF_WINDOW);
  assert.ok(!("p_tenant_id" in (calls.rpc[0] ?? {})), "お店の番号を渡しています");
  assert.equal(calls.rpc[0]?.p_test_mark, TEST_SHOP.mark);
});

test("担当者：窓口がまだ無いときは、今までどおり公開の鍵で読む", async () => {
  const { db, calls } = fakeDb({ anonRows: [{ id: 5, daily_wage: 10000 }] });
  const r = await findTestShopStaff(db as any, TENANT, STAFF);
  assert.equal(r.found, true);
  assert.equal(r.dailyWage, 10000);
  assert.equal(r.via, "anon");
  assert.deepEqual(calls.from, ["staff_members"]);
});

test("担当者：読めなかったら『いない』と言わない（同じ名前で2人目を入れないため）", async () => {
  const { db } = fakeDb({
    window: { data: null, error: { code: "42501", message: "permission denied" } },
  });
  const r = await findTestShopStaff(db as any, TENANT, STAFF);
  assert.equal(r.found, false);
  assert.equal(r.unreadable, true);
  assert.equal(r.dailyWage, null);
});

test("担当者：日当が入っていないときは null（金額を作らない）", async () => {
  const { db } = fakeDb({
    window: { data: [{ id: 5, name: STAFF, daily_wage: null, is_active: true }], error: null },
  });
  const r = await findTestShopStaff(db as any, TENANT, STAFF);
  assert.equal(r.found, true);
  assert.equal(r.dailyWage, null);
});

test("窓口の答えから、名前と日当だけを取り出す（止めている人は落とす）", () => {
  const rows = [
    { id: 2, name: "ロ", daily_wage: "9000", is_active: true },
    { id: 1, name: "イ", daily_wage: 10000, is_active: true },
    { id: 9, name: "やめた人", daily_wage: 8000, is_active: false },
    { id: 8, daily_wage: 100 },
  ];
  assert.deepEqual(
    staffWagesFromWindowRows(rows).map((r) => [r.name, r.dailyWage]),
    [
      ["イ", 10000],
      ["ロ", 9000],
    ],
  );
  assert.deepEqual(staffWagesFromWindowRows(null), []);
});

test("窓口で読めた日当を表に重ねる（もとの表は上書きしない・0や空は足さない）", () => {
  const before = new Map<string, number>([["イデ", 9000]]);
  const after = mergeWindowWages(before, [
    { name: "イデ", dailyWage: 1 },
    { name: "テスト太郎", dailyWage: 10000 },
    { name: "日当なし", dailyWage: null },
    { name: "ゼロ", dailyWage: 0 },
  ]);
  assert.equal(after.get("イデ"), 9000, "もとの表を上書きしています");
  assert.equal(after.get("テスト太郎"), 10000);
  assert.equal(after.has("日当なし"), false);
  assert.equal(after.has("ゼロ"), false);
  assert.equal(before.size, 1, "もとの表そのものを書き換えています");
});
