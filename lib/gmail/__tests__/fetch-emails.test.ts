/**
 * Gmail メール取得ユーティリティの単体テスト。
 *
 * 実 API 呼び出しはモックせず、純関数のみ検証する。
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// oauth.ts が import 時に env を必要とするため、ダミー値をセット
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.GOOGLE_REDIRECT_URI_DEVELOPMENT =
  "http://localhost:3000/api/auth/google/callback";

test("_buildQueryForTest: from / to / newer_than を含む正しいクエリ", async () => {
  const { _buildQueryForTest } = await import("../fetch-emails");
  const q = _buildQueryForTest(6);
  assert.ok(q.includes("from:tebaya1222@gmail.com"));
  assert.ok(q.includes("to:food-assistant@m-nagayama.co.jp"));
  assert.ok(q.includes("newer_than:6m"));
});

test("_buildQueryForTest: months 引数が反映される", async () => {
  const { _buildQueryForTest } = await import("../fetch-emails");
  assert.ok(_buildQueryForTest(1).includes("newer_than:1m"));
  assert.ok(_buildQueryForTest(12).includes("newer_than:12m"));
});
