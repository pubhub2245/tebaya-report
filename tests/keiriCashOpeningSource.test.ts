import { test } from "node:test";
import assert from "node:assert/strict";

import {
  KEIRI_OPENING_SHELF,
  TEBAYA_DAILY_OPENING_SHELF,
  buildCashOpeningSource,
} from "../lib/keiri/cashOpeningSource";

/**
 * 「経理の『今の現金』は、どの数え始めから数えているのか」（2026-10-19・f1-4）の決まりを固定する。
 *
 * ■ ここで守りたいこと
 *   ① 経理が読む棚は keiri_settings だけ（手羽屋の毎日の画面の棚に入れ替わらない）
 *   ② 2つの数え始めがちがうときは、そう言う（どちらかを誤りにしない・金額は出さない）
 *   ③ 数え始めが決まっていないときは、金庫と比べる前に決めてもらう
 *   ④ 金額は1円も出さない
 */

test("経理が読む棚は keiri_settings だけ（手羽屋の毎日の画面の棚と取り違えない）", () => {
  const s = buildCashOpeningSource({
    openingDate: "2026-09-10",
    otherOpeningDate: "2026-07-20",
    otherShelfExists: true,
  });
  assert.equal(s.usedShelf, "keiri_settings");
  assert.equal(KEIRI_OPENING_SHELF, "keiri_settings");
  assert.equal(s.otherShelf, "cash_settings");
  assert.equal(TEBAYA_DAILY_OPENING_SHELF, "cash_settings");
  assert.equal(s.openingDate, "2026-09-10");
});

test("2つの数え始めがちがうときは、ちがうと言い、比べる相手は経理の金額だと言う", () => {
  const s = buildCashOpeningSource({
    openingDate: "2026-09-10",
    otherOpeningDate: "2026-07-20",
    otherShelfExists: true,
  });
  assert.equal(s.differs, true);
  assert.match(s.line, /2026\/9\/10/);
  assert.match(s.line, /2026\/7\/20/);
  assert.match(s.line, /この経理の画面の金額です/);
  // どちらかを「誤り」にしない
  assert.match(s.line, /どちらも誤りではありません/);
});

test("同じ日なら「ちがう」とは言わない", () => {
  const s = buildCashOpeningSource({
    openingDate: "2026-09-10",
    otherOpeningDate: "2026-09-10",
    otherShelfExists: true,
  });
  assert.equal(s.differs, false);
  assert.match(s.line, /金庫を数えて比べるのは、この金額です/);
});

test("手羽屋の毎日の画面の棚に日が入っていないときは「ちがう」と言わない", () => {
  const s = buildCashOpeningSource({
    openingDate: "2026-09-10",
    otherOpeningDate: null,
    otherShelfExists: true,
  });
  assert.equal(s.differs, false);
});

test("棚そのものが無いときも「ちがう」と言わない", () => {
  const s = buildCashOpeningSource({
    openingDate: "2026-09-10",
    otherOpeningDate: null,
    otherShelfExists: false,
  });
  assert.equal(s.differs, false);
  assert.equal(s.otherShelfExists, false);
});

test("経理の数え始めが決まっていないときは、金庫と比べる前に決めてもらう", () => {
  const s = buildCashOpeningSource({
    openingDate: null,
    otherOpeningDate: "2026-07-20",
    otherShelfExists: true,
  });
  assert.equal(s.differs, false);
  assert.match(s.line, /まだ決まっていません/);
  assert.match(s.line, /比べても意味がありません/);
});

test("金額は1文字も出さない（円・数字の金額が混ざらない）", () => {
  for (const s of [
    buildCashOpeningSource({
      openingDate: "2026-09-10",
      otherOpeningDate: "2026-07-20",
      otherShelfExists: true,
    }),
    buildCashOpeningSource({
      openingDate: null,
      otherOpeningDate: null,
      otherShelfExists: false,
    }),
  ]) {
    const body = JSON.stringify(s);
    assert.ok(!/145,000/.test(body));
    assert.ok(!/¥/.test(body));
  }
});
