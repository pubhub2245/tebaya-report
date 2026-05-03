/**
 * Gmail OAuth ユーティリティの単体テスト。
 *
 * 実 API 呼び出しを伴う部分（exchangeCodeAndStore / getAuthedClient 等）はテストしない。
 * 環境変数依存の純関数（URL 生成・リダイレクト URI 切替）のみ検証。
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// 環境変数をテスト用にセット（import より前）
process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.GOOGLE_REDIRECT_URI_PRODUCTION =
  "https://tebaya-report.vercel.app/api/auth/google/callback";
process.env.GOOGLE_REDIRECT_URI_DEVELOPMENT =
  "http://localhost:3000/api/auth/google/callback";

test("buildAuthUrl: gmail.readonly スコープ込みの URL を返す", async () => {
  const { buildAuthUrl, GMAIL_SCOPES } = await import("../oauth");
  const url = buildAuthUrl();
  assert.match(url, /accounts\.google\.com/);
  assert.match(url, /scope=/);
  // gmail.readonly スコープが含まれる
  assert.ok(GMAIL_SCOPES[0] === "https://www.googleapis.com/auth/gmail.readonly");
  assert.match(url, /gmail\.readonly/);
});

test("buildAuthUrl: access_type=offline (refresh_token を要求)", async () => {
  const { buildAuthUrl } = await import("../oauth");
  const url = buildAuthUrl();
  assert.match(url, /access_type=offline/);
});

test("buildAuthUrl: prompt=consent (毎回 refresh_token 取得を強制)", async () => {
  const { buildAuthUrl } = await import("../oauth");
  const url = buildAuthUrl();
  assert.match(url, /prompt=consent/);
});

test("buildAuthUrl: NODE_ENV=production なら本番 redirect URI", async () => {
  // 注: import がキャッシュされるので毎回 require 相当はできないが、
  //     redirect URI は OAuth2 client の URL に反映されるのでチェック可能。
  // VERCEL_ENV を一時的に上書き
  const orig = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    // 注: import('../oauth') のキャッシュを避けるためモジュールキャッシュを削除する仕組みは
    //     ESM では使えない。代わりに getOAuth2Client() で内部的に getRedirectUri を毎回呼ぶ
    //     ので、URL の比較で検証可能。
    const { buildAuthUrl } = await import("../oauth");
    const url = buildAuthUrl();
    assert.match(url, /redirect_uri=/);
    // 本番URI（エンコード済み）が含まれる
    assert.ok(
      url.includes(
        encodeURIComponent(
          "https://tebaya-report.vercel.app/api/auth/google/callback",
        ),
      ),
    );
  } finally {
    if (orig === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = orig;
  }
});

test("PRIMARY_GMAIL_USER は tebaya1222@gmail.com", async () => {
  const { PRIMARY_GMAIL_USER } = await import("../oauth");
  assert.equal(PRIMARY_GMAIL_USER, "tebaya1222@gmail.com");
});
