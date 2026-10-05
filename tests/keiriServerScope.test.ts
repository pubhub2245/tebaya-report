/**
 * サーバー側で経理の数字を読むとき、**よそのお店のものを読まない**かの確かめ
 * （lib/keiri/loadMonthServer.ts・2026-10-05・kp239・f3-4）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   「事例ページ」と「外から確かめる窓口」は、ブラウザではなく**サーバー側**で
 *   同じ数字を読みます。ここが手羽屋だけを見る形に固まっていると、
 *   お店が増えたときに **よその店の画面に手羽屋の立替（お金）が混ざります**。
 *   とくに立替の2つの棚には「どの店のものか」の欄がまだ無いので、
 *   読んだ時点で混ざります。
 *
 * ■ ここで守ること
 *   ① 何も渡さなければ、**これまでと1行も変わらない**（手羽屋＝印が空のものだけ）
 *   ② よそのお店として読むときは、立替の2つの棚を**読まない**（画面側と同じ決まり）
 *   ③ 読まなかったことを「0件だった」と取り違えない（飛ばした印を返す）
 *   ※ 数字は作り物です（実在のお店の金額は置きません）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { businessCodeMatchesScope, loadKeiriMonthServer } from "../lib/keiri/loadMonthServer";

type Call = { table: string; filters: string[] };

/** 倉庫のふり。どの棚に、どんな絞り込みで聞いたかだけを覚える */
function fakeDb(rowsByTable: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  function from(table: string) {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const q: any = {
      select: () => q,
      eq: (c: string, v: string) => (call.filters.push(`eq:${c}=${v}`), q),
      is: (c: string, _v: null) => (call.filters.push(`is:${c}=null`), q),
      gte: () => q,
      lte: () => q,
      order: () => Promise.resolve({ data: rowsByTable[table] ?? [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (res: (v: { data: unknown[]; error: null }) => void) =>
        res({ data: rowsByTable[table] ?? [], error: null }),
    };
    return q;
  }
  return { db: { from } as unknown, calls };
}

const tableNames = (calls: Call[]) => calls.map((c) => c.table);

test("何も渡さなければ、これまでどおり手羽屋（印が空）のものだけを読む", async () => {
  const { db, calls } = fakeDb();
  await loadKeiriMonthServer({ ym: "2026-09", businessCode: "tebaya", db });

  const reports = calls.find((c) => c.table === "keiri_reports");
  assert.ok(reports, "日報の棚に聞いている");
  assert.ok(reports!.filters.includes("is:tenant_id=null"), "印が空のものだけに絞っている");

  const cash = calls.find((c) => c.table === "keiri_cash_events");
  assert.ok(cash!.filters.includes("is:tenant_id=null"));

  assert.ok(tableNames(calls).includes("keiri_advance_expenses"), "手羽屋は立替を読む");
  assert.ok(tableNames(calls).includes("advance_expenses"), "手羽屋は経営側の立替も読む");
});

test("よそのお店として読むときは、立替の2つの棚を読まない（混ざらない）", async () => {
  const other = "11111111-2222-3333-4444-555555555555";
  const { db, calls } = fakeDb();
  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: `t_${other}`,
    scope: other,
    db,
  });

  const reports = calls.find((c) => c.table === "keiri_reports");
  assert.ok(reports!.filters.includes(`eq:tenant_id=${other}`), "そのお店の印のものだけ");

  assert.equal(tableNames(calls).includes("keiri_advance_expenses"), false);
  assert.equal(tableNames(calls).includes("advance_expenses"), false);
  assert.equal(data.advances.length, 0);
  assert.equal(data.advancesSkipped, true, "読まなかったことを返す（0件と取り違えない）");
  assert.equal(data.advancesUnreadable, false, "読めなかったのではなく、読まないと決めた");
});

test("手羽屋のときは「飛ばした」印が立たない", async () => {
  const { db } = fakeDb();
  const data = await loadKeiriMonthServer({ ym: "2026-09", businessCode: "tebaya", db });
  assert.equal(data.advancesSkipped, false);
});

test("業態コードと、どのお店かの印が食い違っていないかを見分けられる", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  assert.equal(businessCodeMatchesScope("tebaya", null), true);
  assert.equal(businessCodeMatchesScope(`t_${id}`, id), true);
  assert.equal(businessCodeMatchesScope("tebaya", id), false, "手羽屋のコードでよその店は読まない");
  assert.equal(businessCodeMatchesScope(`t_${id}`, null), false);
});
