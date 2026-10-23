/**
 * 「昔のレシートを直す」管理用の処理を、手羽屋の日報だけに当てる決まりのテスト（f3-4）。
 *
 * ★ここが緩いと、手羽屋の管理画面のボタン1つで
 *   よその店の経費の金額が書き換わり、よその店の写真が手羽屋の置き場へ移ります。
 *   だから「印が空のものだけ」と「確かめられなければ1行も触らない」を固定します。
 */
import test from "node:test";
import assert from "node:assert/strict";

/** よその店の印（お店の番号は UUID の形だけが通る） */
const YOSO = "11111111-2222-3333-4444-555555555555";
const YOSO2 = "99999999-8888-7777-6666-555555555555";

import {
  decideReceiptScopeCheck,
  keepIdsInScope,
  receiptRowsInScope,
  reportIdsInScope,
} from "../lib/receiptAdminScope";

/* ---------- 行の絞り込み ---------- */

test("receiptRowsInScope: 手羽屋のときは、印が空の行だけが残る", () => {
  const rows = [
    { id: "a", tenant_id: null },
    { id: "b", tenant_id: YOSO },
    { id: "c" },
  ];
  assert.deepEqual(
    receiptRowsInScope(rows).map((r) => r.id),
    ["a", "c"],
  );
});

test("receiptRowsInScope: よその店のときは、その店の行だけが残る", () => {
  const rows = [
    { id: "a", tenant_id: null },
    { id: "b", tenant_id: YOSO },
    { id: "c", tenant_id: YOSO2 },
  ];
  assert.deepEqual(
    receiptRowsInScope(rows, YOSO).map((r) => r.id),
    ["b"],
  );
});

test("keepIdsInScope: 一覧のうち、このお店だった番号だけが残る（並び順は変えない）", () => {
  const index = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(
    keepIdsInScope(index, ["c", "a"]).map((r) => r.id),
    ["a", "c"],
  );
});

test("keepIdsInScope: 1件も残らなければ空（よその店の行だけだったとき）", () => {
  assert.deepEqual(keepIdsInScope([{ id: "a" }], []), []);
});

/* ---------- 確かめられなかったとき ---------- */

test("decideReceiptScopeCheck: 確かめられたら進む", () => {
  const v = decideReceiptScopeCheck({ errorMessage: null, what: "引っ越し" });
  assert.equal(v.proceed, true);
  assert.equal(v.message, null);
});

test("decideReceiptScopeCheck: 確かめられなければ止まり、やさしい1行が出る", () => {
  const v = decideReceiptScopeCheck({
    errorMessage: 'column "tenant_id" does not exist',
    what: "昔のレシートの読み直し",
  });
  assert.equal(v.proceed, false);
  assert.match(v.message ?? "", /中止しました/);
  assert.match(v.message ?? "", /1行も変えていません/);
  assert.match(v.message ?? "", /昔のレシートの読み直し/);
});

/* ---------- 棚への聞き方 ---------- */

/** 問い合わせの形を記録する、最小の偽物 */
function fakeDb(answer: { data?: unknown; error?: { message: string } }) {
  const calls: Record<string, unknown>[] = [];
  const q: any = {
    select() {
      return q;
    },
    in(col: string, vals: string[]) {
      calls.push({ op: "in", col, vals });
      return q;
    },
    is(col: string, val: null) {
      calls.push({ op: "is", col, val });
      return q;
    },
    eq(col: string, val: string) {
      calls.push({ op: "eq", col, val });
      return q;
    },
    then(resolve: (v: unknown) => void) {
      resolve({ data: answer.data ?? null, error: answer.error ?? null });
    },
  };
  return { db: { from: () => q }, calls };
}

test("reportIdsInScope: 手羽屋のときは『印が空のものだけ』で聞く", async () => {
  const { db, calls } = fakeDb({ data: [{ id: "a" }] });
  const r = await reportIdsInScope(db, ["a", "b"]);
  assert.deepEqual(r.ids, ["a"]);
  assert.equal(r.errorMessage, null);
  assert.deepEqual(calls, [
    { op: "in", col: "id", vals: ["a", "b"] },
    { op: "is", col: "tenant_id", val: null },
  ]);
});

test("reportIdsInScope: よその店のときは、その店の印で聞く", async () => {
  const { db, calls } = fakeDb({ data: [{ id: "b" }] });
  const r = await reportIdsInScope(db, ["a", "b"], YOSO);
  assert.deepEqual(r.ids, ["b"]);
  assert.deepEqual(calls[1], { op: "eq", col: "tenant_id", val: YOSO });
});

test("reportIdsInScope: 聞けなかったら、番号を1つも返さず理由を返す", async () => {
  const { db } = fakeDb({ error: { message: "棚が答えませんでした" } });
  const r = await reportIdsInScope(db, ["a"]);
  assert.deepEqual(r.ids, []);
  assert.equal(r.errorMessage, "棚が答えませんでした");
});

test("reportIdsInScope: 番号が0件なら、棚に聞きに行かない", async () => {
  let asked = false;
  const db = {
    from() {
      asked = true;
      return {} as any;
    },
  };
  const r = await reportIdsInScope(db, []);
  assert.deepEqual(r, { ids: [], errorMessage: null });
  assert.equal(asked, false);
});
