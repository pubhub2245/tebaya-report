/**
 * 経理の数字を読む2つの道が同じ答えを出すか、の数え方（lib/keiri/readPaths.ts）。
 *
 * ■ 何を守っているか
 *   手羽屋の経理の画面を「サーバー側の窓口から読む」形に寄せたとき、
 *   **出る数字が1円も変わらない**ことを外から確かめられるようにしました（kp239・f3-4）。
 *   その数え方がまちがっていると、変わっているのに「同じ」と言ってしまいます。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compareReadPaths, type ReadPathNumbers } from "../lib/keiri/readPaths";

function numbers(over: Partial<ReadPathNumbers> = {}): ReadPathNumbers {
  return {
    reports: 15,
    payments: 2,
    advances: 7,
    cashEvents: 0,
    sales: 554700,
    expenseTotal: 714554,
    profit: -159854,
    cash: 1004399,
    dupes: 30,
    settingsKey: "2026-09-10|145000|0.1|35000|2026-09",
    ...over,
  };
}

test("件数も金額も同じなら『同じ』", () => {
  const r = compareReadPaths(numbers(), numbers());
  assert.equal(r.same, true);
  assert.deepEqual(r.diffs, []);
  assert.match(r.summary, /1円・1件もちがいません/);
});

test("1円でもちがえば『ちがう』と言い、差を出す（金額そのものは出さない）", () => {
  const r = compareReadPaths(numbers(), numbers({ expenseTotal: 714553 }));
  assert.equal(r.same, false);
  assert.deepEqual(r.diffs, [{ what: "かかったお金の合計", diff: 1 }]);
});

test("件数のちがいも拾う", () => {
  const r = compareReadPaths(numbers(), numbers({ reports: 14, advances: 6 }));
  assert.equal(r.same, false);
  assert.deepEqual(
    r.diffs.map((d) => d.what),
    ["日報の件数", "立替の件数"],
  );
});

test("経理の設定がちがえば、差ではなく『ちがう』だけを言う", () => {
  const r = compareReadPaths(numbers(), numbers({ settingsKey: "2026-09-10|0|0.1|35000|2026-09" }));
  assert.equal(r.same, false);
  assert.equal(r.diffs.length, 1);
  assert.equal(r.diffs[0].diff, null);
});

/**
 * ★2026-10-11（kp249）：ここを比べていなかったので、1回 戻すことになった。
 *   立替の件数だけがちがったとき、月の金額は同じでも
 *   **金庫にあるはずの額**と**人の確認待ちの件数**は動きうる。
 *   じゅんが金庫を数えて見比べる相手なので、必ず比べる。
 */
test("金庫にあるはずの額がちがえば『ちがう』と言う", () => {
  const r = compareReadPaths(numbers(), numbers({ cash: 1004398 }));
  assert.equal(r.same, false);
  assert.deepEqual(r.diffs, [{ what: "いまの現金（金庫にあるはずの額）", diff: 1 }]);
});

test("人の確認待ち（同じ支払いの疑い）の件数がちがえば『ちがう』と言う", () => {
  const r = compareReadPaths(numbers(), numbers({ dupes: 31 }));
  assert.equal(r.same, false);
  assert.deepEqual(r.diffs, [{ what: "同じ支払いが2か所にある疑いの件数", diff: -1 }]);
});
