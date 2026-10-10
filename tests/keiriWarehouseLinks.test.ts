/**
 * 倉庫（Supabase）の SQL Editor への行き先のテスト（kp238）。
 *
 * ここが狂うと、じゅんを間違った所へ送ってしまう。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { sqlEditorUrl } from "../lib/keiri/warehouseLinks";

test("倉庫の住所から、SQL Editor の行き先を作る", () => {
  assert.equal(
    sqlEditorUrl("https://vtuyebyjbvjmucqpkxug.supabase.co"),
    "https://supabase.com/dashboard/project/vtuyebyjbvjmucqpkxug/sql/new",
  );
});

test("前後に空白があっても作れる", () => {
  assert.equal(
    sqlEditorUrl("  https://abcdef123456.supabase.co/  "),
    "https://supabase.com/dashboard/project/abcdef123456/sql/new",
  );
});

test("住所が読めないときはリンクを出さない（間違った所へ送らない）", () => {
  assert.equal(sqlEditorUrl(""), null);
  assert.equal(sqlEditorUrl(undefined), null);
  assert.equal(sqlEditorUrl("not-a-url"), null);
  assert.equal(sqlEditorUrl("https://example.com"), null);
});
