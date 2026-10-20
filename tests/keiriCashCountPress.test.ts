/**
 * 金庫を数えるときに「何回 押せば記録に残るか」を縛るテスト（2026-10-20・kp245・f1-4）。
 *
 * ■ ここで守りたいこと
 *   ・置き場（keiri_cash_events）がまだ無いあいだは、［比べる］の**1押し**で控えまで残る
 *   ・置き場ができたあとは、押すたびに行が増えるので**今までどおり2回**
 *   ・控えを置く場所（経理の設定の行）が公開の鍵で読めないときは
 *     「残ります」と言わない（じゅんに1分 使わせる前に止める）
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildCashCountPress,
  cashCountPathOf,
  compareAlsoKeeps,
  compareResultLine,
  keepButtonLabel,
  pressesNeeded,
} from "../lib/keiri/cashCountPress";

test("置き場が無いあいだは控えの道・1押し／できたあとは棚の道・2押し", () => {
  assert.equal(cashCountPathOf(true), "控え");
  assert.equal(cashCountPathOf(false), "棚");
  assert.equal(compareAlsoKeeps(true), true);
  assert.equal(compareAlsoKeeps(false), false);
  assert.equal(pressesNeeded(true), 1);
  assert.equal(pressesNeeded(false), 2);
});

test("残ったら言い切る／まだなら残りの1回を名指しする", () => {
  const kept = compareResultLine({ shelfMissing: true, kept: true });
  assert.ok(kept.includes("控えに残しました"));
  assert.ok(!kept.includes("残していません"));

  const notYet = compareResultLine({ shelfMissing: true, kept: false });
  assert.ok(notYet.includes("記録に残していません"));
  assert.ok(notYet.includes("この結果を控えに残す"));

  // 棚の道は今までどおりの言い方（押すのは2回）
  const shelf = compareResultLine({ shelfMissing: false, kept: false });
  assert.ok(shelf.includes("この結果を記録する"));
});

test("押しボタンの言葉：残ったあとは『押さなくても残っています』と言う", () => {
  assert.equal(
    keepButtonLabel({ shelfMissing: true, compared: true, kept: false, saving: false }),
    "あと1回：この結果を控えに残す（これで終わりです）",
  );
  assert.ok(
    keepButtonLabel({ shelfMissing: true, compared: true, kept: true, saving: false }).includes(
      "押さなくても残っています",
    ),
  );
  assert.equal(
    keepButtonLabel({ shelfMissing: true, compared: false, kept: false, saving: true }),
    "控えています…",
  );
  assert.equal(
    keepButtonLabel({ shelfMissing: false, compared: false, kept: false, saving: true }),
    "保存中…",
  );
});

test("控えの道：置く場所が読めれば『1回だけ』と答える", () => {
  const p = buildCashCountPress({ shelfMissing: true, rowReadable: true, readError: null });
  assert.equal(p.path, "控え");
  assert.equal(p.presses, 1);
  assert.equal(p.willKeep, true);
  assert.equal(p.reason, null);
  assert.ok(p.line.includes("1 回"));
  assert.ok(p.line.includes("貼り紙は待ちません"));
});

test("控えの道：置く場所が読めないときは『残りません』と言う（金額は出さない）", () => {
  const none = buildCashCountPress({ shelfMissing: true, rowReadable: false, readError: null });
  assert.equal(none.willKeep, false);
  assert.ok(none.reason && none.reason.includes("1つも返りませんでした"));
  assert.ok(none.line.includes("いま押しても記録が残りません"));

  const err = buildCashCountPress({
    shelfMissing: true,
    rowReadable: false,
    readError: "permission denied for table keiri_settings",
  });
  assert.equal(err.willKeep, false);
  assert.ok(err.reason && err.reason.includes("permission denied"));
});

test("棚の道：押すのは2回・外からは確かめていないと正直に出す", () => {
  const p = buildCashCountPress({ shelfMissing: false, rowReadable: false, readError: null });
  assert.equal(p.path, "棚");
  assert.equal(p.presses, 2);
  assert.equal(p.willKeep, null);
  assert.ok(p.line.includes("外から確かめていません"));
});

test("どの答えにも金額の桁が混ざらない（円の数字を出さない）", () => {
  for (const p of [
    buildCashCountPress({ shelfMissing: true, rowReadable: true, readError: null }),
    buildCashCountPress({ shelfMissing: true, rowReadable: false, readError: null }),
    buildCashCountPress({ shelfMissing: false, rowReadable: false, readError: null }),
  ]) {
    assert.ok(!/\d{3,}/.test(p.line), p.line);
    assert.ok(p.note.includes("1行も書き込みません"));
  }
});
