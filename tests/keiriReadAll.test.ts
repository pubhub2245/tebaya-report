import { strict as assert } from "node:assert";
import { test } from "node:test";

import { readAllRows, READ_ALL_PAGE_SIZE } from "@/lib/keiri/readAll";

/**
 * 倉庫が「1回につき N 行まで」しか返さないときの偽物。
 * 本物と同じく、超えた分は**エラーにならず黙って切り落とされる**ようにしてある。
 */
function fakeStore(totalRows: number, serverCap: number) {
  const all = Array.from({ length: totalRows }, (_, i) => ({ i }));
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    make() {
      return {
        range(from: number, to: number) {
          calls += 1;
          const want = Math.max(0, to - from + 1);
          const data = all.slice(from, from + Math.min(want, serverCap));
          return Promise.resolve({ data, error: null, count: all.length });
        },
      };
    },
  };
}

test("倉庫の上限より行が多くても、ぜんぶ読む（切り落とされない）", async () => {
  const store = fakeStore(30, 25);
  const got = await readAllRows(() => store.make());
  assert.equal(got.rows.length, 30);
  assert.equal(got.total, 30);
  assert.equal(got.incomplete, false);
  assert.equal(got.pages, 2);
});

test("1回で足りるときは1回しか聞かない（今までと同じ回数）", async () => {
  const store = fakeStore(12, 1000);
  const got = await readAllRows(() => store.make());
  assert.equal(got.rows.length, 12);
  assert.equal(store.calls, 1);
  assert.equal(got.incomplete, false);
});

test("1行も無い月でも落ちない", async () => {
  const store = fakeStore(0, 25);
  const got = await readAllRows(() => store.make());
  assert.deepEqual(got.rows, []);
  assert.equal(got.incomplete, false);
  assert.equal(got.error, null);
});

test("上限がとても小さくても、行の中身と順番は変わらない", async () => {
  const store = fakeStore(53, 7);
  const got = await readAllRows(() => store.make(), { pageSize: 20 });
  assert.equal(got.rows.length, 53);
  assert.deepEqual(
    got.rows.map((r) => (r as { i: number }).i),
    Array.from({ length: 53 }, (_, i) => i),
  );
});

test("倉庫が断ったときは、断られたことを隠さない（読めた分＋error）", async () => {
  let calls = 0;
  const got = await readAllRows(() => ({
    range() {
      calls += 1;
      return Promise.resolve({ data: null, error: { message: "だめ" }, count: null });
    },
  }));
  assert.equal(calls, 1);
  assert.equal(got.incomplete, true);
  assert.notEqual(got.error, null);
  assert.deepEqual(got.rows, []);
});

test("行数を答えない倉庫では、頼んだ数より少なく返った所で止める", async () => {
  let calls = 0;
  const got = await readAllRows(
    () => ({
      range(from: number, to: number) {
        calls += 1;
        const want = to - from + 1;
        const data = Array.from({ length: Math.min(want, 3) }, (_, i) => ({ i: from + i }));
        return Promise.resolve({ data, error: null, count: null });
      },
    }),
    { pageSize: 5 },
  );
  assert.equal(calls, 1);
  assert.equal(got.rows.length, 3);
  assert.equal(got.incomplete, false);
});

test("打ち切りがある（無限に読み続けない）", async () => {
  const got = await readAllRows(
    () => ({
      range(from: number, to: number) {
        const want = to - from + 1;
        const data = Array.from({ length: want }, (_, i) => ({ i: from + i }));
        // ぜんぶで何行あるか分からず、毎回 満杯で返り続ける倉庫
        return Promise.resolve({ data, error: null, count: 1_000_000 });
      },
    }),
    { pageSize: 10, maxPages: 4 },
  );
  assert.equal(got.pages, 4);
  assert.equal(got.rows.length, 40);
  assert.equal(got.incomplete, true);
});

test("1回ぶんの行数の既定は 1000（上限を上げたいとき用の目印）", () => {
  assert.equal(READ_ALL_PAGE_SIZE, 1000);
});
