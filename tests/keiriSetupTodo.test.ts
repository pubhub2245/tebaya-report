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

import { buildSetupTodo, minutesOf, totalMinutes } from "../lib/keiri/setupTodo";

const ALL_UNDONE = {
  shelves: { done: 0, total: 6 },
  key: { configured: true, usable: false },
  cash: { shelfMissing: true, counted: false },
};

test("まだ何も済んでいない：3件のこり・金庫（1分・1押し）が先頭", () => {
  const t = buildSetupTodo(ALL_UNDONE);
  assert.equal(t.remaining, 3);
  assert.equal(t.unknown, 0);
  assert.equal(t.allDone, false);
  // ★2026-10-20：いちばん短い手続き（1分・1押し・ほかを待たない）を先頭にした
  assert.equal(t.items[0].id, "cash");
  assert.deepEqual(
    t.items.map((i) => i.id),
    ["cash", "shelves", "key"],
  );
  assert.match(t.summary, /のこりの手続きは 3 件/);
  // 貼り紙が止めている仕上げの項目を、取りこぼさず名指しする
  const shelves = t.items.find((i) => i.id === "shelves")!;
  assert.deepEqual(shelves.checks, ["f1-4", "f1-5", "f1-6", "f3-4", "f5-4"]);
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

// ★2026-10-13（f1-4）：棚がまだ無くても、数えた1回は「控え」に残るようにした。
//   そのため「記録は残りません」ではなく「控えに残ります」と言う。
//   （1分で済む手続きが、2分の貼り紙を待たないようにするため）
test("棚がまだ無いときは、金庫は「のこり」。ただし控えに残ることを言う", () => {
  const t = buildSetupTodo(ALL_UNDONE);
  const cash = t.items.find((i) => i.id === "cash")!;
  assert.equal(cash.state, "のこり");
  assert.match(cash.detail, /控えに残ります/);
  assert.doesNotMatch(cash.detail, /記録は残りません/);
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

/* ------------------------------------------------------------------ *
 *  2026-10-15 追加（f1-4）：「互いに待っている」と読まれないようにする
 *
 *  10/15 に、のこりが順番に並んでいることから
 *  「上（倉庫の貼り紙・2分）が済むまで、下（金庫を数える・1分）は押しても
 *  意味が無い」と読まれ、1分で済む手続きが止まりました。
 *  実際には金庫の1分は貼り紙を待ちません（棚がまだ無いあいだは控えに残ります）。
 *  また、金庫は画面で2回 押して初めて記録に残るので、押すものを全部 持たせます。
 * ------------------------------------------------------------------ */
test("のこりが2件以上なら「互いに待っていない」と言う", () => {
  const t = buildSetupTodo(ALL_UNDONE);
  assert.ok(t.independentNote);
  assert.match(t.independentNote!, /どれから押しても/);
  assert.match(t.independentNote!, /貼り紙を待ちません/);
});

test("のこりが1件なら、互いに待っていないの1行は出さない", () => {
  const t = buildSetupTodo({
    shelves: { done: 6, total: 6 },
    key: { configured: true, usable: true },
    cash: { shelfMissing: true, counted: false },
  });
  assert.equal(t.remaining, 1);
  assert.equal(t.independentNote, null);
});

test("棚がまだ無いあいだは、押すボタンは1つ（比べた1押しで控えに残る）", () => {
  const cash = buildSetupTodo(ALL_UNDONE).items.find((i) => i.id === "cash")!;
  assert.equal(cash.presses?.length, 1);
  assert.match(cash.presses![0], /比べる/);
  assert.match(cash.presses![0], /この1回だけ/);
  // 棚が無いあいだも「貼り紙を待たない」と言う
  assert.match(cash.detail, /貼り紙を待ちません/);
});

test("棚ができたあとは、押すボタンを2つとも持つ（2回目を落とさない）", () => {
  const cash = buildSetupTodo({
    ...ALL_UNDONE,
    cash: { shelfMissing: false, counted: false },
  }).items.find((i) => i.id === "cash")!;
  assert.equal(cash.presses?.length, 2);
  assert.match(cash.presses![0], /比べる/);
  assert.match(cash.presses![1], /記録する|控えに残す/);
});

test("のこりが3件のときは、金庫（1分・1押し）をいちばん上に出す", () => {
  const t = buildSetupTodo(ALL_UNDONE);
  assert.equal(t.remaining, 3);
  assert.equal(t.items[0].id, "cash");
  assert.equal(t.items[1].id, "shelves");
  assert.equal(t.items[2].id, "key");
});

/* ------------------------------------------------------------------ *
 *  2026-10-28 追加（f3-4）：最後の1タップが一覧から消えないようにする
 *
 *  仕上げで唯一の「不合格」＝f3-4（よその店のデータが見えないか）に
 *  残っているのは「レシート写真の置き場が公開のまま」という1点だけで、
 *  閉めるのは /keiri/key の下にある **1タップ**です。
 *  ところが この一覧は「鍵を貼り直す」が済むとその行を消すので、
 *  鍵を直した瞬間に **最後の1タップが、じゅんが見る唯一の一覧から消える**
 *  形でした（＝f3-4 は閉まらないまま、次の回にまたお願いすることになる）。
 *  そこで「置き場を閉める」を1件として立て、閉まるまで消えないようにします。
 * ------------------------------------------------------------------ */

test("置き場が公開のままなら、鍵が直ったあとも「のこり」として残る", () => {
  const t = buildSetupTodo({
    shelves: { done: 12, total: 12 },
    key: { configured: true, usable: true },
    cash: { shelfMissing: false, counted: true },
    photo: { bucketPublic: true, keyUsable: true },
  });
  const photo = t.items.find((i) => i.id === "photo")!;
  assert.equal(photo.state, "のこり");
  assert.equal(t.remaining, 1);
  assert.equal(t.allDone, false);
  assert.deepEqual(photo.checks, ["f3-4"]);
  assert.equal(photo.presses?.length, 1);
  assert.match(photo.detail, /いま押せます/);
});

test("鍵がまだ使えないときも「のこり」。ただし先に鍵を直すことを言う", () => {
  const photo = buildSetupTodo({
    ...ALL_UNDONE,
    photo: { bucketPublic: true, keyUsable: false },
  }).items.find((i) => i.id === "photo")!;
  assert.equal(photo.state, "のこり");
  assert.equal(photo.presses, undefined);
  assert.match(photo.detail, /鍵を貼り直す/);
});

test("置き場が非公開になったら「済み」。確かめられないときは済みに寄せない", () => {
  const locked = buildSetupTodo({
    shelves: { done: 12, total: 12 },
    key: { configured: true, usable: true },
    cash: { shelfMissing: false, counted: true },
    photo: { bucketPublic: false, keyUsable: true },
  });
  assert.equal(locked.remaining, 0);
  assert.equal(locked.allDone, true);
  assert.equal(locked.items.find((i) => i.id === "photo")!.state, "済み");

  for (const photo of [null, { bucketPublic: null, keyUsable: true }]) {
    const t = buildSetupTodo({
      shelves: { done: 12, total: 12 },
      key: { configured: true, usable: true },
      cash: { shelfMissing: false, counted: true },
      photo,
    });
    const row = t.items.find((i) => i.id === "photo")!;
    assert.equal(row.state, "分からない");
    assert.equal(t.allDone, false);
  }
});

test("鍵の行は、仕上げの f3-4 を閉めることを名指しする", () => {
  const key = buildSetupTodo(ALL_UNDONE).items.find((i) => i.id === "key")!;
  assert.deepEqual(key.checks, ["f3-4"]);
  assert.match(key.benefit, /レシート写真の置き場/);
  assert.match(key.benefit, /不合格/);
});

test("「10秒」は分に足さない（合計を大げさに言わない）", () => {
  assert.equal(minutesOf("10秒"), 0);
  assert.equal(minutesOf("2分"), 2);
  const t = buildSetupTodo({ ...ALL_UNDONE, photo: { bucketPublic: true, keyUsable: false } });
  assert.equal(t.remaining, 4);
  assert.equal(totalMinutes(t.items), 1 + 2 + 1);
});

test("写真の1タップだけは鍵のあと、と1行で言う", () => {
  const t = buildSetupTodo({ ...ALL_UNDONE, photo: { bucketPublic: true, keyUsable: false } });
  assert.ok(t.independentNote);
  assert.match(t.independentNote!, /鍵を貼り直す/);
});
