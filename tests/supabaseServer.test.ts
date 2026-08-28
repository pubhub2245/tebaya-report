/**
 * 「鍵として使える値か」の判定のテスト。
 *
 * ■ なぜこのテストが要るか（2026-08-28 の事故）
 *   Vercel に登録した SUPABASE_SERVICE_ROLE_KEY の値に全角文字が混ざっていた。
 *   通信の合言葉（HTTPヘッダー）には半角文字しか入れられないため、
 *   その鍵を使う処理が**26か所すべて**同時に止まり、
 *   設営後チェック・シフト・意見箱・LINE送信・毎日の自動処理が動かなくなった。
 *
 *   コピペのしそこないは誰にでも起きる。
 *   壊れた値でアプリが全滅しないよう、ここで弾いて元の鍵に戻す。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isUsableKey, checkKey } from "../lib/supabaseServer";

test("ふつうの鍵（半角の英数字と記号）は使える", () => {
  assert.equal(isUsableKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc-_.xyz"), true);
  assert.equal(isUsableKey("sb_secret_AbC123-_="), true);
});

test("全角文字が混ざっていたら使えない（今回の事故そのもの）", () => {
  assert.equal(isUsableKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXV（"), false);
  assert.equal(isUsableKey("キー"), false);
  assert.equal(isUsableKey("abc　def"), false); // 全角スペース
});

test("改行やタブが混ざっていたら使えない", () => {
  assert.equal(isUsableKey("abc\ndef"), false);
  assert.equal(isUsableKey("abc\tdef"), false);
});

test("空は使えない", () => {
  assert.equal(isUsableKey(""), false);
});

test("checkKey: 前後の空白と引用符は、よくあるコピペのしそこないなので取り除く", () => {
  const r = checkKey('  "abc123"  ');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.key, "abc123");
});

test("checkKey: 未設定と「壊れている」を区別する", () => {
  const none = checkKey(undefined);
  assert.equal(none.ok, false);
  if (!none.ok) assert.equal(none.reason, "未設定");

  const empty = checkKey("   ");
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.reason, "未設定");

  const broken = checkKey("eyJhbGciOiJ（あ");
  assert.equal(broken.ok, false);
  if (!broken.ok) assert.equal(broken.reason, "全角などの使えない文字が入っている");
});

test("checkKey: 正しい鍵はそのまま通る", () => {
  const r = checkKey("eyJhbGciOiJIUzI1NiJ9.payload.signature");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.key, "eyJhbGciOiJIUzI1NiJ9.payload.signature");
});
