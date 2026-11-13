/**
 * 「いま よその店の行が何行 公開の鍵で読めているか」の言い方を固定する
 * （lib/keiri/shelfLeak.ts・f3-4・2026-11-13）。
 *
 * 守ること：
 *   ① 聞けなかった棚を「漏れていない」に寄せない（分からないものは分からないと言う）
 *   ② 1本も聞けなかったときは1行も作らない（数えたふりをしない）
 *   ③ 行の中身（名前・金額・お店の番号）は1文字も持たない
 */
import test from "node:test";
import assert from "node:assert/strict";

import { summarizeShelfLeak } from "../lib/keiri/shelfLeak";
import { buildSetupTodo } from "../lib/keiri/setupTodo";

const BASE = {
  shelves: { done: 1, total: 13 },
  key: { configured: true, usable: false },
  cash: { shelfMissing: true, counted: false },
};

test("漏れている棚があれば、合計と内わけを1行で言う", () => {
  const r = summarizeShelfLeak([
    { table: "locations", label: "出店場所", rows: 1 },
    { table: "sale_products", label: "商品と単価", rows: 3 },
    { table: "staff_members", label: "担当者", rows: 0 },
  ]);
  assert.equal(r.rows, 4);
  assert.equal(r.measured, 3);
  assert.equal(r.unknown, 0);
  assert.deepEqual(
    r.tables.map((t) => t.label),
    ["出店場所", "商品と単価"],
  );
  assert.ok(r.line?.includes("4行"));
  assert.ok(r.line?.includes("出店場所 1行"));
  assert.ok(r.line?.includes("商品と単価 3行"));
});

test("ぜんぶ数えられて0行なら、そう言い切る", () => {
  const r = summarizeShelfLeak([
    { table: "locations", label: "出店場所", rows: 0 },
    { table: "sale_products", label: "商品と単価", rows: 0 },
  ]);
  assert.equal(r.rows, 0);
  assert.equal(r.unknown, 0);
  assert.ok(r.line?.includes("1行もありません"));
  assert.ok(!r.line?.includes("聞けませんでした"));
});

test("棚そのものが無い／印の欄が無い棚は「聞けなかった」に数えない", () => {
  const r = summarizeShelfLeak([
    { table: "locations", label: "出店場所", rows: 0, exists: true, hasColumn: true },
    // 棚そのものが無い（貼り紙で作られる）
    { table: "keiri_cash_events", label: "金庫の記録", rows: null, exists: false, hasColumn: null },
    // 印の欄がまだ無い
    { table: "keiri_payments", label: "払った記録", rows: null, exists: true, hasColumn: false },
    // 本当に聞けなかった
    { table: "sale_products", label: "商品と単価", rows: null, exists: null, hasColumn: null },
  ]);
  assert.equal(r.measured, 1);
  assert.equal(r.cannotLeak, 2);
  assert.equal(r.unknown, 1);
  assert.ok(r.line?.includes("1 つの棚は聞けませんでした"));
});

test("聞けなかった棚があるときは「0行」と言い切らない", () => {
  const r = summarizeShelfLeak([
    { table: "locations", label: "出店場所", rows: 0 },
    { table: "sale_products", label: "商品と単価", rows: null },
  ]);
  assert.equal(r.rows, 0);
  assert.equal(r.unknown, 1);
  assert.ok(r.line?.includes("聞けませんでした"));
});

test("1本も聞けなかったら1行も作らない（数えたふりをしない）", () => {
  const r = summarizeShelfLeak([
    { table: "locations", label: "出店場所", rows: null },
    { table: "sale_products", label: "商品と単価", rows: null },
  ]);
  assert.equal(r.rows, 0);
  assert.equal(r.measured, 0);
  assert.equal(r.unknown, 2);
  assert.equal(r.line, null);
});

test("のこりの一覧に、漏れている行数が出る", () => {
  const todo = buildSetupTodo({
    ...BASE,
    leak: { rows: 4, line: "いま、よその店の行が 4行、公開の鍵で読めます（出店場所 1行）" },
  });
  const shelves = todo.items.find((i) => i.id === "shelves");
  assert.ok(shelves);
  assert.equal(shelves?.state, "のこり");
  assert.ok(shelves?.detail.includes("1／13"));
  assert.ok(shelves?.detail.includes("4行"));
});

test("漏れが0行のときは、のこりの一覧の1行を増やさない", () => {
  const todo = buildSetupTodo({
    ...BASE,
    leak: { rows: 0, line: "いま、公開の鍵で読めてしまう よその店の行は1行もありません" },
  });
  const withLeak = todo.items.find((i) => i.id === "shelves")?.detail;
  const without = buildSetupTodo(BASE).items.find((i) => i.id === "shelves")?.detail;
  assert.equal(withLeak, without);
});

test("渡さなければ、今までとまったく同じ1行", () => {
  const a = buildSetupTodo(BASE).items.find((i) => i.id === "shelves")?.detail;
  const b = buildSetupTodo({ ...BASE, leak: null }).items.find((i) => i.id === "shelves")?.detail;
  assert.equal(a, b);
});
