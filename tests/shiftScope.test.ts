/**
 * 出店予定（シフト）を「どのお店のものか」で分ける道具の固定テスト。
 *
 * ここで守りたいことは2つだけです。
 *  ① 印の欄がまだ無いあいだは、**何も足さない**（手羽屋の毎日の画面が止まらない）
 *  ② 欄ができたら、**手羽屋は「印が空のものだけ」**になり、見えるものは変わらない
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SHIFTS_PROBE_TIMEOUT_MS,
  SHIFTS_TENANT_MIGRATION,
  canSeparateShifts,
  describeShiftsTenantColumn,
  forgetShiftsTenantState,
  scopeShiftsQuery,
  shiftTenantStamp,
  shiftsTenantState,
  shiftsTenantStateOf,
  withShiftTenant,
} from "../lib/shiftScope";

const TENANT = "11111111-2222-3333-4444-555555555555";

/** 絞り込みを覚えるだけの偽の問い合わせ */
function fakeQuery() {
  const calls: string[] = [];
  const q: any = {
    calls,
    is(col: string, val: null) {
      calls.push(`is:${col}:${String(val)}`);
      return q;
    },
    eq(col: string, val: string) {
      calls.push(`eq:${col}:${val}`);
      return q;
    },
  };
  return q;
}

test("欄が無いと言われたら missing（今までどおり）", () => {
  assert.equal(
    shiftsTenantStateOf({ error: { code: "42703", message: "x" } }),
    "missing",
  );
  assert.equal(
    shiftsTenantStateOf({
      error: { message: 'column shifts.tenant_id does not exist' },
    }),
    "missing",
  );
});

test("読めたら ready、よく分からない断りは unknown", () => {
  assert.equal(shiftsTenantStateOf({ error: null }), "ready");
  assert.equal(shiftsTenantStateOf({}), "ready");
  assert.equal(
    shiftsTenantStateOf({ error: { message: "network error" } }),
    "unknown",
  );
  assert.equal(shiftsTenantStateOf(null), "unknown");
});

test("分けてよいのは ready のときだけ", () => {
  assert.equal(canSeparateShifts("ready"), true);
  assert.equal(canSeparateShifts("missing"), false);
  assert.equal(canSeparateShifts("unknown"), false);
});

test("欄が無いあいだは絞り込みを1つも足さない", () => {
  for (const state of ["missing", "unknown"] as const) {
    const q = fakeQuery();
    assert.equal(scopeShiftsQuery(q, null, state), q);
    assert.deepEqual(q.calls, []);
    const q2 = fakeQuery();
    scopeShiftsQuery(q2, TENANT, state);
    assert.deepEqual(q2.calls, []);
  }
});

test("欄があれば手羽屋は「印が空のものだけ」になる", () => {
  const q = fakeQuery();
  scopeShiftsQuery(q, null, "ready");
  assert.deepEqual(q.calls, ["is:tenant_id:null"]);
});

test("欄があればよそのお店は自分の番号のものだけになる", () => {
  const q = fakeQuery();
  scopeShiftsQuery(q, TENANT, "ready");
  assert.deepEqual(q.calls, [`eq:tenant_id:${TENANT}`]);
});

test("お店の番号の形をしていない値は手羽屋に倒す（よその棚を触らない）", () => {
  const q = fakeQuery();
  scopeShiftsQuery(q, "'; drop table shifts; --", "ready");
  assert.deepEqual(q.calls, ["is:tenant_id:null"]);
});

test("保存する中身：欄が無いあいだは1つも足さない", () => {
  assert.deepEqual(shiftTenantStamp(null, "missing"), {});
  assert.deepEqual(shiftTenantStamp(TENANT, "unknown"), {});
  const data = { date: "2026-10-08", location_id: 3 };
  assert.deepEqual(withShiftTenant(data, TENANT, "missing"), data);
});

test("保存する中身：欄があれば手羽屋は空の印（列の既定値と同じ）", () => {
  assert.deepEqual(shiftTenantStamp(null, "ready"), { tenant_id: null });
  assert.deepEqual(
    withShiftTenant({ date: "2026-10-08" }, null, "ready"),
    { date: "2026-10-08", tenant_id: null },
  );
  assert.deepEqual(
    withShiftTenant({ date: "2026-10-08" }, TENANT, "ready"),
    { date: "2026-10-08", tenant_id: TENANT },
  );
});

test("元の中身は書き換えない", () => {
  const data = { date: "2026-10-08" };
  withShiftTenant(data, TENANT, "ready");
  assert.deepEqual(data, { date: "2026-10-08" });
});

test("1回 聞いたら覚える（2回目は聞かない）", async () => {
  forgetShiftsTenantState();
  let asked = 0;
  const run = async () => {
    asked += 1;
    return { error: null };
  };
  assert.equal(await shiftsTenantState(run), "ready");
  assert.equal(await shiftsTenantState(run), "ready");
  assert.equal(asked, 1);
  forgetShiftsTenantState();
});

test("分からなかったときは覚えない（次にもう一度 聞く）", async () => {
  forgetShiftsTenantState();
  let asked = 0;
  const run = async () => {
    asked += 1;
    if (asked === 1) throw new Error("通信できません");
    return { error: { code: "42703", message: "no column" } };
  };
  assert.equal(await shiftsTenantState(run), "unknown");
  assert.equal(await shiftsTenantState(run), "missing");
  assert.equal(asked, 2);
  forgetShiftsTenantState();
});

test("返事が来ないときは待ちきらずに unknown にする", async () => {
  forgetShiftsTenantState();
  const never = () => new Promise<{ error: null }>(() => {});
  assert.equal(await shiftsTenantState(never, 20), "unknown");
  forgetShiftsTenantState();
});

test("待つ上限は4秒（画面が固まったように見えない範囲）", () => {
  assert.equal(SHIFTS_PROBE_TIMEOUT_MS, 4000);
});

test("外から1回開くだけで、何をすればよいか分かる1文が返る", () => {
  const ready = describeShiftsTenantColumn({ error: null });
  assert.equal(ready.usable, true);
  assert.equal(ready.known, true);

  const missing = describeShiftsTenantColumn({
    error: { code: "42703", message: "no column" },
  });
  assert.equal(missing.usable, false);
  assert.equal(missing.known, true);
  assert.ok(missing.note.includes("/keiri/sql"));
  assert.ok(missing.note.includes(SHIFTS_TENANT_MIGRATION));
  // 「出し直さなくてよい」ことが伝わる言い方になっているか
  assert.ok(missing.note.includes("出し直す必要はありません"));

  const unknown = describeShiftsTenantColumn({
    error: { message: "network error" },
  });
  assert.equal(unknown.usable, false);
  assert.equal(unknown.known, false);
});

test("貼り紙の置き場所は、すでにある1枚と同じ（新しい紙を増やさない）", () => {
  assert.equal(
    SHIFTS_TENANT_MIGRATION,
    "supabase/migrations/keiri_shelves_20261005.sql",
  );
});
