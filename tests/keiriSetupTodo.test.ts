/**
 * 「のこりの手続き」の数え方を固定する（lib/keiri/setupTodo.ts・kp247）。
 *
 * ここが狂うと、済んでいない手続きが画面から消えて（＝誰も押さなくなって）
 * 仕上げの f1-4・f1-5・f1-6・f3-4・f5-4 が止まったままになります。
 * 逆に、済んだものがいつまでも出ると「また同じお願いか」になります。
 *
 * 守ること：
 *   ① 分からないときに「済み」へ寄せない（嘘の合格を作らない）
 *   ② のこりを先に並べる（じゅんが上から押すだけでよい形）
 *   ③ 金額・鍵・合言葉は1文字も持たない
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildSetupTodo, totalMinutes } from "../lib/keiri/setupTodo";

const ALL_UNDONE = {
  shelves: { done: 0, total: 6 },
  key: { configured: true, usable: false },
  cash: { shelfMissing: true, counted: false },
};

test("まだ何も済んでいない：3件のこり・貼り紙が先頭", () => {
  const t = buildSetupTodo(ALL_UNDONE);
  assert.equal(t.remaining, 3);
  assert.equal(t.unknown, 0);
  assert.equal(t.allDone, false);
  assert.equal(t.items[0].id, "shelves");
  assert.deepEqual(
    t.items.map((i) => i.id),
    ["shelves", "cash", "key"],
  );
  assert.match(t.summary, /のこりの手続きは 3 件/);
  // 貼り紙が止めている仕上げの項目を、取りこぼさず名指しする
  assert.deepEqual(t.items[0].checks, ["f1-4", "f1-5", "f1-6", "f3-4", "f5-4"]);
});

test("貼り紙が全部 流れたら「済み」になり、のこりから外れる", () => {
  const t = buildSetupTodo({ ...ALL_UNDONE, shelves: { done: 6, total: 6 } });
  assert.equal(t.remaining, 2);
  const shelves = t.items.find((i) => i.id === "shelves")!;
  assert.equal(shelves.state, "済み");
  // 済んだものは後ろへ下がる
  assert.equal(t.items[t.items.length - 1].id, "shelves");
});

test("貼り紙が途中までなら、のこり本数を言う（済みにしない）", () => {
  const t = buildSetupTodo({ ...ALL_UNDONE, shelves: { done: 4, total: 6 } });
  const shelves = t.items.find((i) => i.id === "shelves")!;
  assert.equal(shelves.state, "のこり");
  assert.match(shelves.detail, /4／6/);
  assert.match(shelves.detail, /のこり 2 本/);
});

test("棚があって数えた記録もあれば、金庫の手続きは済み", () => {
  const t = buildSetupTodo({
    shelves: { done: 6, total: 6 },
    key: { configured: true, usable: true },
    cash: { shelfMissing: false, counted: true },
  });
  assert.equal(t.remaining, 0);
  assert.equal(t.allDone, true);
  assert.match(t.summary, /のこりの手続きはありません/);
});

test("棚がまだ無いときは、金庫は「のこり」で、記録が残らないことを言う", () => {
  const t = buildSetupTodo(ALL_UNDONE);
  const cash = t.items.find((i) => i.id === "cash")!;
  assert.equal(cash.state, "のこり");
  assert.match(cash.detail, /記録は残りません/);
});

test("棚はあるが まだ1件も数えていない：のこり・言い方を分ける", () => {
  const t = buildSetupTodo({
    ...ALL_UNDONE,
    shelves: { done: 6, total: 6 },
    cash: { shelfMissing: false, counted: false },
  });
  const cash = t.items.find((i) => i.id === "cash")!;
  assert.equal(cash.state, "のこり");
  assert.match(cash.detail, /まだ1件もありません/);
});

test("読めなかったものは「分からない」。済みにも のこりにも数えない", () => {
  const t = buildSetupTodo({ shelves: null, key: null, cash: null });
  assert.equal(t.remaining, 0);
  assert.equal(t.unknown, 3);
  assert.equal(t.allDone, false);
  assert.match(t.summary, /3 件は確かめられませんでした/);
  for (const i of t.items) assert.equal(i.state, "分からない");
});

test("鍵：入っていないのと、鍵でないものが入っているのを言い分ける", () => {
  const missing = buildSetupTodo({ ...ALL_UNDONE, key: { configured: false, usable: false } });
  assert.match(missing.items.find((i) => i.id === "key")!.detail, /まだ入っていません/);
  const broken = buildSetupTodo({ ...ALL_UNDONE, key: { configured: true, usable: false } });
  assert.match(broken.items.find((i) => i.id === "key")!.detail, /鍵ではないもの/);
});

test("のこっている分の時間だけを足す", () => {
  const all = buildSetupTodo(ALL_UNDONE);
  assert.equal(totalMinutes(all.items), 2 + 1 + 1);
  const done = buildSetupTodo({
    shelves: { done: 6, total: 6 },
    key: { configured: true, usable: true },
    cash: { shelfMissing: false, counted: false },
  });
  assert.equal(totalMinutes(done.items), 1);
});

test("鍵・合言葉・金額の値は1文字も持たない", () => {
  const dump = JSON.stringify(buildSetupTodo(ALL_UNDONE));
  for (const banned of ["eyJ", "sb_", "SERVICE_ROLE", "password", "合言葉の値"]) {
    assert.equal(dump.includes(banned), false, `${banned} が混ざっています`);
  }
});
