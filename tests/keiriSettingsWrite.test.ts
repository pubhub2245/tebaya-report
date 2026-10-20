/**
 * 経理の設定に書き込んだあとの合否（lib/keiri/keiriSettingsWrite.ts・2026-10-20・f3-3・f3-4）。
 *
 * ■ ここで固定すること
 *   ① **手羽屋は1行も変わらない**（1行 変われば今までと同じ言葉が出る）
 *   ② 1行も変わらなかったときに「保存しました」と言わない（貼り紙⑫のあとの申し込んだお店）
 *   ③ 変えた行を数えられなかったときも「保存しました」と言わない
 *   ④ 控えを置く前の読みで行が無ければ、書き込まずに止まる
 *   ※ 金額・お店の名前は置きません（判定だけの検算です）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  decideMemoPreread,
  decideSettingsWriteResult,
} from "../lib/keiri/keiriSettingsWrite";

test("手羽屋：1行 変わったら、今までどおりの言葉が出る", () => {
  const a = decideSettingsWriteResult({
    isTebaya: true,
    errorMessage: null,
    changedRows: 1,
    target: "設定",
  });
  assert.equal(a.ok, true);
  assert.equal(a.message, "✅ 保存しました");
  assert.equal(a.needsHuman, false);

  const b = decideSettingsWriteResult({
    isTebaya: true,
    errorMessage: null,
    changedRows: 1,
    target: "金庫の控え",
  });
  assert.equal(b.ok, true);
  assert.equal(b.message, "✅ 控えに残しました（置き場ができたら、そのまま記録に移ります）");
});

test("1行も変わらなかったときは、成功と言わない（0件を成功と取り違えない）", () => {
  for (const target of ["設定", "金庫の控え"] as const) {
    const v = decideSettingsWriteResult({
      isTebaya: false,
      errorMessage: null,
      changedRows: 0,
      target,
    });
    assert.equal(v.ok, false);
    assert.equal(v.needsHuman, true);
    assert.ok(!v.message.includes("✅"));
    assert.ok(v.message.includes("1行も変わっていません"));
    assert.ok(v.message.includes("まだどこにも残っていません"));
  }
});

test("変えた行を数えられなかったときも、成功と言わない", () => {
  const v = decideSettingsWriteResult({
    isTebaya: false,
    errorMessage: null,
    changedRows: null,
    target: "設定",
  });
  assert.equal(v.ok, false);
  assert.equal(v.needsHuman, false);
  assert.ok(v.message.includes("確かめられませんでした"));
  assert.ok(!v.message.includes("✅"));
});

test("倉庫がエラーを返したときの言葉は、今までと同じ形", () => {
  assert.equal(
    decideSettingsWriteResult({
      isTebaya: true,
      errorMessage: "だめでした",
      changedRows: null,
      target: "設定",
    }).message,
    "❌ 保存できませんでした：だめでした",
  );
  assert.equal(
    decideSettingsWriteResult({
      isTebaya: true,
      errorMessage: "だめでした",
      changedRows: null,
      target: "金庫の控え",
    }).message,
    "控えを残せませんでした：だめでした",
  );
});

test("控えの前の読み：行があれば今までどおり進む", () => {
  const v = decideMemoPreread({ isTebaya: true, rowFound: true, errorMessage: null });
  assert.equal(v.proceed, true);
  assert.equal(v.message, null);
});

test("控えの前の読み：行が無ければ書き込まずに止まる", () => {
  const v = decideMemoPreread({ isTebaya: false, rowFound: false, errorMessage: null });
  assert.equal(v.proceed, false);
  assert.ok(v.message && v.message.includes("ここでは残しません"));
  assert.ok(v.message && !v.message.includes("✅"));
});

test("控えの前の読み：エラーなら今までと同じ言葉で止まる", () => {
  const v = decideMemoPreread({
    isTebaya: false,
    rowFound: false,
    errorMessage: "読めません",
  });
  assert.equal(v.proceed, false);
  assert.equal(v.message, "控えを残せませんでした：読めません");
});
