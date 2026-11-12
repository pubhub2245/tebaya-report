/**
 * 「金庫を数えて押したとき、その1回が本当に残せるか」の下見
 * （lib/keiri/cashWriteProbe.ts・2026-11-12・kp245・f1-4）。
 *
 * ■ なぜ要るか
 *   倉庫は、書き込む相手が1行も見つからなくてもエラーを返さず
 *   「0行 変えました」と成功で返します。そのままだと じゅんが1分を使ったあとに
 *   「残りませんでした」と分かることになります。ここは**押す前**に、
 *   0行＝残せない・1行以上＝残せる を取り違えないことを固定します。
 *
 * ■ ここで守ること
 *   ① 0行を「残せた」と言わない（いちばん大事）
 *   ② 読めなかった・数えられなかったときに「残せない」と言い切らない（null で返す）
 *   ③ 倉庫が返したエラーの文を、そのまま外へ出さない（鍵が混じることがあるため）
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  cashWriteProbeNotMeasurable,
  decideCashWriteProbe,
} from "../lib/keiri/cashWriteProbe";

test("1行 変われば「残せます」＝じゅんに押してもらってよい", () => {
  const r = decideCashWriteProbe({ rowFound: true, errorMessage: null, changedRows: 1 });
  assert.equal(r.canKeep, true);
  assert.equal(r.safeToPress, true);
  assert.match(r.verdict, /控えは残せます/);
});

test("0行なら「残せません」＝押してもらう前にこちらで直す", () => {
  const r = decideCashWriteProbe({ rowFound: true, errorMessage: null, changedRows: 0 });
  assert.equal(r.canKeep, false);
  assert.equal(r.safeToPress, false);
  assert.match(r.verdict, /1行も変わりませんでした/);
});

test("行が見つからなければ「残せません」", () => {
  const r = decideCashWriteProbe({ rowFound: false, errorMessage: null, changedRows: null });
  assert.equal(r.canKeep, false);
  assert.equal(r.safeToPress, false);
});

test("数えられなかったときは「残せない」と言い切らない（null）", () => {
  const r = decideCashWriteProbe({ rowFound: true, errorMessage: null, changedRows: null });
  assert.equal(r.canKeep, null);
  assert.equal(r.safeToPress, false);
});

test("倉庫のエラーの文は、そのまま外へ出さない", () => {
  const secret = "key=abcdef123456 でことわられました";
  const r = decideCashWriteProbe({ rowFound: true, errorMessage: secret, changedRows: null });
  assert.equal(r.canKeep, false);
  assert.equal(r.safeToPress, false);
  assert.ok(!r.verdict.includes("abcdef123456"));
});

test("下見そのものができない日は null（「残せない」ではない）", () => {
  const r = cashWriteProbeNotMeasurable("倉庫が眠っています");
  assert.equal(r.canKeep, null);
  assert.equal(r.safeToPress, false);
  assert.match(r.verdict, /「残せない」という意味ではありません/);
});
