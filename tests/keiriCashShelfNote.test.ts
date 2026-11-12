import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CASH_SHELF_MISSING_NOTE,
  cashCountNeedsSheetFirst,
  cashShelfNote,
  cashShelfState,
} from "@/lib/keiri/cashShelfNote";

test("置き場が無いときの1行は『貼り紙を待つ必要はありません』と必ず言う", () => {
  const note = cashShelfNote(true);
  assert.equal(note, CASH_SHELF_MISSING_NOTE);
  assert.ok(note.includes("貼り紙を待つ必要はありません"));
  // ★11/12 まで出ていた、じゅんの順番を逆にしていた言い方は戻さない
  assert.ok(!note.includes("画面で比べるところまでしかできません"));
});

test("置き場が無いときの1行は、いま数えれば合否が出ると言う", () => {
  const note = cashShelfNote(true);
  assert.ok(note.includes("/api/keiri/cashcount"));
  assert.ok(note.includes("合否が出ます"));
});

test("置き場があるときの1行は、置き場に残ると言う", () => {
  const note = cashShelfNote(false);
  assert.ok(note.includes("置き場があります"));
  assert.ok(!note.includes("貼り紙"));
});

test("どちらの1行も、金額も合否そのものも言わない", () => {
  for (const note of [cashShelfNote(true), cashShelfNote(false)]) {
    assert.ok(!/[0-9]+円/.test(note));
    assert.ok(!note.includes("合っています"));
    assert.ok(!note.includes("合っていません"));
  }
});

test("置き場の状態の言葉は ready / missing の2つだけ", () => {
  assert.equal(cashShelfState(true), "missing");
  assert.equal(cashShelfState(false), "ready");
});

test("金庫を数えるのに、貼り紙を先に流す必要はどちらの道でもない", () => {
  assert.equal(cashCountNeedsSheetFirst(true), false);
  assert.equal(cashCountNeedsSheetFirst(false), false);
});
