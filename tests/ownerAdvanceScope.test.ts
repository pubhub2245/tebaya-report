/**
 * 経営側の立替（advance_expenses）を、印の欄が無くても壊さずに絞って読む係の見張り
 * （2026-10-25・f3-4・kp264）。
 *
 * ここで止めたいこと：
 *   ① 欄がまだ無い倉庫で、手羽屋の立替が**読めなくなる**こと（＝毎日の画面が壊れる）
 *   ② 「欄が無い」以外の断りで、黙って**絞りを外して**しまうこと（＝守りが緩む）
 */
import test from "node:test";
import assert from "node:assert/strict";

import { withOwnerAdvanceTenant } from "../lib/keiri/ownerAdvanceScope";

const MISSING = {
  code: "42703",
  message: 'column advance_expenses.tenant_id does not exist',
};

test("欄があるとき：絞って1回だけ聞き、その答えを返す", async () => {
  const asked: boolean[] = [];
  const res = await withOwnerAdvanceTenant<number[]>(async (scoped) => {
    asked.push(scoped);
    return { data: [1, 2], error: null };
  });
  assert.deepEqual(asked, [true]);
  assert.equal(res.scoped, true);
  assert.deepEqual(res.data, [1, 2]);
  assert.equal(res.error, null);
});

test("欄がまだ無いとき：絞らずに聞き直し、手羽屋の行はそのまま読める", async () => {
  const asked: boolean[] = [];
  const res = await withOwnerAdvanceTenant<number[]>(async (scoped) => {
    asked.push(scoped);
    if (scoped) return { data: null, error: MISSING };
    return { data: [1, 2, 3], error: null };
  });
  assert.deepEqual(asked, [true, false], "1回目は絞って、2回目だけ絞らずに聞くこと");
  assert.equal(res.scoped, false);
  assert.deepEqual(res.data, [1, 2, 3]);
  assert.equal(res.error, null);
});

test("欄が無いこと以外の断りでは、聞き直さない（守りを緩めない）", async () => {
  const asked: boolean[] = [];
  const res = await withOwnerAdvanceTenant<number[]>(async (scoped) => {
    asked.push(scoped);
    return { data: null, error: { code: "PGRST301", message: "JWT expired" } };
  });
  assert.deepEqual(asked, [true], "絞らずに聞き直してはいけない");
  assert.equal(res.scoped, true);
  assert.equal(res.data, null);
  assert.ok(res.error);
});

test("聞き直したほうも失敗したら、その断りをそのまま返す", async () => {
  const res = await withOwnerAdvanceTenant<number[]>(async (scoped) =>
    scoped
      ? { data: null, error: MISSING }
      : { data: null, error: { code: "08006", message: "connection failure" } },
  );
  assert.equal(res.scoped, false);
  assert.equal(res.error?.code, "08006");
});
