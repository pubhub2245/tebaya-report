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
import { isUsableKey, checkKey, noStoreFetch } from "../lib/supabaseServer";
import { readFileSync } from "node:fs";

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

/**
 * 2026-09-19 追加：貼り付けのしそこないを「前後だけ」直す。
 *
 * 本番の SUPABASE_SERVICE_ROLE_KEY が「値は入っているが使えない」状態だったため。
 * 前後に全角スペースや見えない印が紛れ込んだだけなら、人の作業ゼロで直る。
 * 途中に混ざっていたときは、今までどおり「壊れている」と正直に出す（勝手に直さない）。
 */
test("checkKey: 前後の全角スペースは取り除いて使えるようにする", () => {
  const r = checkKey("　eyJhbGciOiJIUzI1NiJ9.payload.signature　");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.key, "eyJhbGciOiJIUzI1NiJ9.payload.signature");
});

test("checkKey: 見えない印（BOM・ゼロ幅）も前後なら取り除く", () => {
  const r = checkKey("﻿eyJhbGciOiJIUzI1NiJ9.payload.signature​");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.key, "eyJhbGciOiJIUzI1NiJ9.payload.signature");
});

test("checkKey: 全角の引用符で囲まれていても取り除く", () => {
  const r = checkKey("「eyJhbGciOiJIUzI1NiJ9.payload.signature」");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.key, "eyJhbGciOiJIUzI1NiJ9.payload.signature");
});

test("checkKey: 値の途中に全角が混ざっているときは、勝手に直さず「壊れている」と出す", () => {
  const r = checkKey("　eyJhbGci（OiJIUzI1NiJ9.payload　");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "全角などの使えない文字が入っている");
});

test("checkKey: 全角スペースだけの値は「未設定」と同じ扱いにする", () => {
  const r = checkKey("　　");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "未設定");
});

// ------------------------------------------------------------
// 「覚えないで」の取り方（kp99）
//   2026-09-19、訪問の数を見せる窓口が、表に行が入ったあとも
//   空っぽだった時の答えを返し続けた（10:43 に一度読んだあと 10:49 まで 0）。
//   数を数える所は、毎回倉庫に取りに行かせる。
// ------------------------------------------------------------

test("noStoreFetch：問い合わせに『覚えないで』を付けて渡す", async () => {
  const seen: { url: unknown; init: RequestInit | undefined }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    seen.push({ url, init });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await noStoreFetch("https://example.test/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://example.test/x");
  assert.equal(seen[0].init?.cache, "no-store");
  // 元の指定は消さない
  assert.equal(seen[0].init?.method, "POST");
});

test("数を見せる所と診断は『覚えないで』で繋ぐ（手羽屋の画面は既定のまま）", () => {
  for (const f of ["../app/api/hit/summary/route.ts", "../app/api/keiri/diagnose/route.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(src.includes("{ fresh: true }"), `${f}：fresh が付いていません`);
    assert.ok(
      !/serverClient\(\)/.test(src) && !/serviceClientOrNull\(\)/.test(src),
      `${f}：覚えたままの繋ぎ方が残っています`,
    );
  }
});
