/**
 * 「倉庫が読めていないのに合格と答えない」ための対照（f3-3・f3-4）のテスト。
 *
 * ここが狂うと、倉庫が止まっている日に
 * 「よその店の行は0件でした＝分かれています・合格」と答えてしまう。
 * 2026-11-06 の朝、本番で実際に起きた形をそのまま固定する。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ALIVE_PROBE_TABLE,
  aliveStateOf,
  probeWarehouseAlive,
  type AliveProbeClient,
} from "../lib/keiri/warehouseAlive";

/** 倉庫のふり。count と error を好きな形で返す */
function fakeDb(
  page: { count?: number | null; error?: unknown } | "throw" | "hang",
  seen?: { table?: string; column?: string; head?: boolean },
): AliveProbeClient {
  return {
    from(table: string) {
      if (seen) seen.table = table;
      return {
        select(_columns: string, options: { count: "exact"; head: true }) {
          if (seen) seen.head = options.head;
          return {
            is(column: string) {
              if (seen) seen.column = column;
              if (page === "throw") throw new Error("fetch failed");
              if (page === "hang") return new Promise<any>(() => {});
              return Promise.resolve(page);
            },
          };
        },
      };
    },
  };
}

test("手羽屋の行が1件以上 見えたときだけ、生きていると言う", () => {
  assert.equal(aliveStateOf({ count: 151 }).alive, true);
  assert.equal(aliveStateOf({ count: 1 }).state, "alive");
});

test("読めたのに0件なら、測れないと言う（0件を合格の材料にしない）", () => {
  const r = aliveStateOf({ count: 0 });
  assert.equal(r.alive, false);
  assert.equal(r.state, "empty");
});

test("断られた・件数が返らないときは、測れないと言う", () => {
  assert.equal(aliveStateOf({ error: new Error("fetch failed") }).state, "unreachable");
  assert.equal(aliveStateOf({ count: null }).state, "unreachable");
  assert.equal(aliveStateOf({}).alive, false);
});

test("行の中身は受け取らない（数えるだけ・印が空の行で数える）", async () => {
  const seen: { table?: string; column?: string; head?: boolean } = {};
  await probeWarehouseAlive(fakeDb({ count: 3 }, seen));
  assert.equal(seen.table, ALIVE_PROBE_TABLE);
  assert.equal(seen.column, "tenant_id");
  assert.equal(seen.head, true);
});

test("倉庫につなげないとき（例外）も、測れないと言う", async () => {
  const r = await probeWarehouseAlive(fakeDb("throw"));
  assert.equal(r.alive, false);
  assert.equal(r.state, "unreachable");
});

test("返事が来ないときは、線を引いて待つのをやめる（白いままにしない）", async () => {
  const started = Date.now();
  const r = await probeWarehouseAlive(fakeDb("hang"), { budgetMs: 40 });
  assert.equal(r.alive, false);
  assert.equal(r.state, "unreachable");
  assert.ok(Date.now() - started < 3000);
});

test("人に見せる一言に、鍵・金額・倉庫の住所を入れない（断り文をそのまま出さない）", () => {
  for (const r of [
    aliveStateOf({ count: 2 }),
    aliveStateOf({ count: 0 }),
    aliveStateOf({ error: new Error("https://x.supabase.co key=eyJabc") }),
  ]) {
    assert.equal(/eyJ|supabase|http|円|fetch failed/.test(r.reason), false);
  }
});
