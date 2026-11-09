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

import {
  buildSetupTodo,
  f34Note,
  F34_ITEM_IDS,
  minutesOf,
  totalMinutes,
  warehouseAnswering,
} from "../lib/keiri/setupTodo";

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

test("棚ができたあとも、押すボタンは1つ（2026-11-01・貼り紙のあとに金庫を押すため）", () => {
  const cash = buildSetupTodo({
    ...ALL_UNDONE,
    cash: { shelfMissing: false, counted: false },
  }).items.find((i) => i.id === "cash")!;
  assert.equal(cash.presses?.length, 1);
  assert.match(cash.presses![0], /比べる/);
  assert.match(cash.presses![0], /この1回だけ/);
  // 棚の道では「控え」ではなく「記録」に残ると言う（置き場ができているため）
  assert.match(cash.presses![0], /記録に残ります/);
  assert.match(cash.detail, /行は増えません/);
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
  // ★2026-11-09：ここは /不合格/ を見ていましたが、「この1分で不合格が閉まります」は
  //   言い過ぎでした（f3-4 は貼り紙・鍵・写真の置き場の3つがそろって初めて閉まる）。
  //   f3-4 を名指しすることは残し、言い切りだけをやめます。
  assert.match(key.benefit, /よその店のデータが見えないか/);
  assert.ok(!key.benefit.includes("これで閉まります"));
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


/* ------------------------------------------------------------------ *
 *  倉庫から返事が来ていない日（2026-11-07・B／f1-4）
 *
 *  ■ なぜこの試験が要るのか（本番でそうなっていた）
 *    2026-11-07、倉庫が眠っているのに この一覧は
 *    「のこりの手続きは 2 件です（合わせて 3分ほど）」と出し、
 *    貼り紙の行は **「4／13 が流れています（のこり 9 本）」**と、
 *    1本も確かめられていないのに数えたふりをしていました。
 *    じゅんが開くと「いま押せる」と読めますが、押しても答えは出ません。
 * ------------------------------------------------------------------ */

const ASLEEP = {
  // 13本ぜんぶ「確かめられませんでした」＝数えていない
  shelves: { done: 0, total: 13, unknown: 13 },
  key: { configured: true, usable: false },
  cash: null,
  photo: null,
};

test("1本も確かめられなかった貼り紙は「のこり◯本」と言わない", () => {
  const row = buildSetupTodo(ASLEEP).items.find((i) => i.id === "shelves")!;
  assert.equal(row.state, "分からない");
  assert.match(row.detail, /確かめられませんでした/);
  assert.doesNotMatch(row.detail, /流れています/);
  assert.doesNotMatch(row.detail, /のこり/);
});

test("一部だけ確かめられなかったときは、のこりと分けて書く", () => {
  const row = buildSetupTodo({
    ...ASLEEP,
    shelves: { done: 4, total: 13, unknown: 2 },
  }).items.find((i) => i.id === "shelves")!;
  assert.equal(row.state, "のこり");
  assert.match(row.detail, /のこり 7 本/);
  assert.match(row.detail, /2 本は確かめられませんでした/);
});

test("倉庫から返事が来ていない日は、押しても進まないものを名指しする", () => {
  const t = buildSetupTodo(ASLEEP);
  assert.equal(warehouseAnswering(ASLEEP), false);
  assert.ok(t.warehouseNote, "倉庫が眠っている1行が出ていません");
  assert.match(t.warehouseNote!, /貼り紙/);
  assert.match(t.warehouseNote!, /金庫/);
  // いまでもできる1つ（鍵は倉庫を使わないので押せる）を言う
  assert.match(t.warehouseNote!, /鍵を貼り直す/);
  // 鍵の行だけは「のこり」のまま（押せるものを消さない）
  const key = t.items.find((i) => i.id === "key")!;
  assert.equal(key.state, "のこり");
});

test("倉庫が答えているときは、その1行を出さない", () => {
  // 片方でも答えていれば出さない（1つの棚が読めないのは前からあるため）
  const answering = {
    ...ASLEEP,
    shelves: { done: 0, total: 13, unknown: 13 },
    cash: { shelfMissing: true, counted: false },
  };
  assert.equal(warehouseAnswering(answering), true);
  assert.equal(buildSetupTodo(answering).warehouseNote, null);
  assert.equal(buildSetupTodo(ALL_UNDONE).warehouseNote, null);
});


test("f3-4 は『3つそろって初めて閉まる』と言う／1つ押しただけでは閉まったと言わない（2026-11-09）", () => {
  const t = buildSetupTodo({
    shelves: { done: 0, total: 13 },
    key: { configured: true, usable: false },
    cash: { shelfMissing: true, counted: false },
    photo: { bucketPublic: true, keyUsable: false },
  });
  assert.ok(t.f34Note);
  assert.match(t.f34Note!, /3つがそろって初めて閉まります/);
  assert.match(t.f34Note!, /いまのこっているのは 3 つ/);
  // 鍵だけ済んでも「閉まりました」と言わない
  const keyDone = buildSetupTodo({
    shelves: { done: 0, total: 13 },
    key: { configured: true, usable: true },
    cash: { shelfMissing: true, counted: false },
    photo: { bucketPublic: true, keyUsable: true },
  });
  assert.match(keyDone.f34Note!, /いまのこっているのは 2 つ/);
});

test("f3-4 の3つが済んでも、合格とは言わない（外から測り直してから付ける）", () => {
  const t = buildSetupTodo({
    shelves: { done: 13, total: 13 },
    key: { configured: true, usable: true },
    cash: { shelfMissing: false, counted: true },
    photo: { bucketPublic: false, keyUsable: true },
  });
  assert.match(t.f34Note!, /ぜんぶ済んでいます/);
  assert.ok(!/合格です/.test(t.f34Note!));
});

test("『分からない』は閉まった側に数えない（嘘の合格を作らない）", () => {
  const t = buildSetupTodo({
    shelves: { done: 13, total: 13 },
    key: null,
    cash: null,
    photo: null,
  });
  assert.match(t.f34Note!, /いまのこっているのは 2 つ/);
});

test("鍵と写真の置き場は『これで閉まります』と言わない（言い過ぎを戻さない）", () => {
  const t = buildSetupTodo({
    shelves: { done: 0, total: 13 },
    key: { configured: true, usable: false },
    cash: { shelfMissing: true, counted: false },
    photo: { bucketPublic: true, keyUsable: false },
  });
  for (const id of ["key", "photo"]) {
    const item = t.items.find((i) => i.id === id)!;
    assert.ok(!item.benefit.includes("これで閉まります"), `${id} の説明が言い過ぎています`);
    assert.match(item.benefit, /のうちの1つ/);
    assert.match(item.benefit, /よその店のデータが見えないか/);
  }
  assert.deepEqual(F34_ITEM_IDS, ["shelves", "key", "photo"]);
  assert.equal(f34Note([]), null);
});
