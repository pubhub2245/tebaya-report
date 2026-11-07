/**
 * 写真だけの日報（lib/photoReport.ts）のテスト。
 *
 * 現場は数字を打たないので、ここが狂うと売上・経費がそのまま間違って残る。
 * とくに「金額を勝手に作らない」「場代はマスタどおり」を固定する。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDailyReportRow,
  buildMemoPrompt,
  buildPhotoReportDraft,
  matchMemoToProducts,
  parseMemoText,
  photoReportLineText,
  receiptToExpenses,
} from "../lib/photoReport";
import type { SaleProduct } from "../lib/salesBreakdown";

const PRODUCTS: SaleProduct[] = [
  { id: 1, shop: "手羽屋", name: "手羽先", price: 200, kind: "primary", is_active: true, sort_order: 0 },
  { id: 2, shop: "手羽屋", name: "手羽餃子", price: 300, kind: "normal", is_active: true, sort_order: 10 },
  { id: 3, shop: "手羽屋", name: "ポテト", price: 350, kind: "normal", is_active: true, sort_order: 20 },
];

const memo = (items: { name: string; count: number }[], total: number) => ({
  items,
  total,
  unreadable: "",
  raw: "",
});

test("指示文に商品マスタの名前がそのまま入る", () => {
  const p = buildMemoPrompt(["手羽先", "手羽餃子"]);
  assert.match(p, /- 手羽先\n- 手羽餃子/);
});

test("AIの返事を読む：数字に余計な文字が付いていても数にする", () => {
  const r = parseMemoText('はい\n{"items":[{"name":"手羽先","count":"120本"}],"total":"¥24,000","unreadable":""}');
  assert.deepEqual(r.items, [{ name: "手羽先", count: 120 }]);
  assert.equal(r.total, 24000);
});

test("AIの返事が壊れていたら空（数字を作らない）", () => {
  const r = parseMemoText("読めませんでした");
  assert.deepEqual(r.items, []);
  assert.equal(r.total, 0);
});

test("味ごとに書かれた手羽先は主力商品にまとめる。知らない名前は残す", () => {
  const m = matchMemoToProducts(
    [
      { name: "塩", count: 40 },
      { name: "タレ", count: 30 },
      { name: "のり塩", count: 10 },
      { name: "手羽餃子", count: 5 },
      { name: "からあげ", count: 2 },
    ],
    PRODUCTS,
  );
  assert.deepEqual(m.counts, { 手羽先: 80, 手羽餃子: 5 });
  assert.deepEqual(m.unmatched, [{ name: "からあげ", count: 2 }]);
});

test("メモの合計が売上。本数×単価と合っていれば警告なし", () => {
  const d = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "ニシムタ",
    products: PRODUCTS,
    memo: memo([{ name: "手羽先", count: 100 }, { name: "手羽餃子", count: 10 }], 23000),
    receiptExpenses: [],
    boothFeeRule: { type: "fixed", amount: 5000 },
    cumulativeBefore: 0,
  });
  assert.equal(d.sales, 23000);
  assert.equal(d.mismatch, null);
  assert.equal(d.breakdown.matched, true);
  // 場代は自動で1行
  assert.deepEqual(
    d.expenses.map((e) => [e.description, e.amount, e.booth_fee]),
    [["場代", 5000, true]],
  );
});

test("合わないときは知らせるが、売上の金額は直さない", () => {
  const d = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "ながやま鷹尾",
    products: PRODUCTS,
    memo: memo([{ name: "手羽先", count: 100 }], 20400),
    receiptExpenses: [],
    boothFeeRule: { type: "percent", rate: 10 },
    cumulativeBefore: 0,
  });
  assert.equal(d.sales, 20400);
  assert.match(d.mismatch ?? "", /¥400 多い/);
  // ながやまは売上の10%（1円未満切り捨て）
  assert.equal(d.expenses[0].amount, 2040);
});

test("合計が読めなければ本数×単価を売上にする。どちらも無ければ保存させない", () => {
  const a = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "マンガ倉庫",
    products: PRODUCTS,
    memo: memo([{ name: "ポテト", count: 2 }], 0),
    receiptExpenses: [],
    boothFeeRule: { type: "none" },
    cumulativeBefore: 0,
  });
  assert.equal(a.sales, 700);
  assert.equal(a.expenses.length, 0); // マンガ倉庫は場代の行を作らない
  const b = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "マンガ倉庫",
    products: PRODUCTS,
    memo: memo([], 0),
    receiptExpenses: [],
    boothFeeRule: { type: "none" },
    cumulativeBefore: 0,
  });
  assert.equal(b.salesMissing, true);
});

test("レシート1枚の品物すべてに同じ写真と立替者が付く", () => {
  const rows = receiptToExpenses(
    { items: [{ name: "油", amount: 1080 }, { name: "塩", amount: 216 }] },
    "data:photo",
  );
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.receipt_image_url === "data:photo" && r.paid_by === "ゆうや"));
  // 品名が読めずに合計だけのとき
  assert.deepEqual(
    receiptToExpenses({ amount: 980 }, "p").map((r) => r.amount),
    [980],
  );
});

test("保存する行：日当0円・本数は互換カラムにも入る・累計に足す", () => {
  const d = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "ニシムタ",
    products: PRODUCTS,
    memo: memo([{ name: "手羽先", count: 100 }, { name: "手羽餃子", count: 10 }], 23000),
    receiptExpenses: receiptToExpenses({ items: [{ name: "油", amount: 1000 }] }, "p"),
    boothFeeRule: { type: "fixed", amount: 5000 },
    cumulativeBefore: 500000,
  });
  const text = photoReportLineText({ date: "2026-11-08", location: "ニシムタ", staffName: "ゆうや", draft: d });
  const row = buildDailyReportRow({
    date: "2026-11-08",
    location: "ニシムタ",
    staffName: "ゆうや",
    draft: d,
    products: PRODUCTS,
    cumulativeBefore: 500000,
    expensesForSave: d.expenses,
    lineText: text,
    cleanupInventory: {},
    cleanupTasks: {},
  });
  assert.equal(row.labor, 0);
  assert.equal(row.remaining_tebasaki, 100);
  assert.equal(row.remaining_gyoza, 10);
  assert.equal(row.cumulative_sales, 523000);
  assert.equal(row.shop, "手羽屋");
  assert.equal(row.tenant_id, null);
  assert.match(text, /売上：¥23,000/);
  assert.match(text, /経費：¥6,000/);
  assert.match(text, /差引：¥17,000/);
});
