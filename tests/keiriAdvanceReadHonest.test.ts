import { test } from "node:test";
import assert from "node:assert/strict";

import { decideAdvanceRead } from "../lib/keiri/advanceReadHonest";

/**
 * 立替（現場）の「最近の10件」を、読めなかったのに「0件」と出さない決まり
 * （2026-10-19・kp253 ③・f3-4）を固定する。
 *
 * ■ ここで守りたいこと
 *   ① 手羽屋は何があっても今までどおり一覧が出る（印が空＝締めても読める）
 *   ② よその店で・棚が締まっていて・0件 なら「読めなかった」と言う（0件と取り違えない）
 *   ③ 1行でも読めていれば出す（読む道は開いている）
 *   ④ 締まったか確かめられないときは出す（開かずに閉じない）
 *   ⑤ 止めるときは「いま入れた分は残っている」と言う（二重に入れさせない）
 */

test("手羽屋は、棚が締まっていても今までどおり一覧が出る", () => {
  for (const shelfState of ["締まっている", "まだ", "分からない"] as const) {
    const v = decideAdvanceRead({ isTebaya: true, rows: 0, shelfState });
    assert.equal(v.showList, true);
    assert.equal(v.message, null);
  }
});

test("よその店・棚が締まっている・0件 は「読めなかった」と言う（0件と取り違えない）", () => {
  const v = decideAdvanceRead({ isTebaya: false, rows: 0, shelfState: "締まっている" });
  assert.equal(v.showList, false);
  assert.ok(v.message);
  assert.match(v.message!, /読めませんでした/);
});

test("止めるときは「いま入れた分は残っている」と言う（二重に入れさせない）", () => {
  const v = decideAdvanceRead({ isTebaya: false, rows: 0, shelfState: "締まっている" });
  assert.match(v.message!, /記録に残っています/);
  assert.match(v.message!, /もう一度 入れないでください/);
});

test("1行でも読めていれば一覧を出す", () => {
  const v = decideAdvanceRead({ isTebaya: false, rows: 3, shelfState: "締まっている" });
  assert.equal(v.showList, true);
  assert.equal(v.message, null);
});

test("棚がまだ締まっていないときの0件は、本当に0件なので一覧を出す", () => {
  const v = decideAdvanceRead({ isTebaya: false, rows: 0, shelfState: "まだ" });
  assert.equal(v.showList, true);
  assert.equal(v.message, null);
});

test("締まったか確かめられないときは、今までどおり一覧を出す（開かずに閉じない）", () => {
  const v = decideAdvanceRead({ isTebaya: false, rows: 0, shelfState: "分からない" });
  assert.equal(v.showList, true);
  assert.equal(v.message, null);
});
