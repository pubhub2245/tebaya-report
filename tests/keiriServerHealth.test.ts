import assert from "node:assert/strict";
import test from "node:test";

import {
  describeRecordStore,
  describeServerKey,
} from "../lib/keiri/serverHealth";
import { describeTableError } from "../lib/keiri/signupReadiness";

test("鍵が使えるときは、そのまま使えると出す", () => {
  const r = describeServerKey({ ok: true, key: "abc" });
  assert.equal(r.configured, true);
  assert.equal(r.usable, true);
});

test("「未設定」と「値が壊れている」を必ず言い分ける（直し方が違うため）", () => {
  const missing = describeServerKey({ ok: false, reason: "未設定" });
  const broken = describeServerKey({
    ok: false,
    reason: "全角などの使えない文字が入っている",
  });

  assert.equal(missing.configured, false);
  assert.equal(broken.configured, true); // 値は入っているが使えない
  assert.equal(missing.usable, false);
  assert.equal(broken.usable, false);
  assert.notEqual(missing.note, broken.note);
  assert.ok(broken.note.includes("貼り直"));
});

test("鍵の値そのものは、どの説明文にも出さない", () => {
  const secret = "SUPER-SECRET-KEY-VALUE";
  const r = describeServerKey({ ok: true, key: secret });
  assert.ok(!JSON.stringify(r).includes(secret));
});

test("置き場が読めないとき、鍵が使えないなら原因としてそう書く", () => {
  const key = describeServerKey({ ok: false, reason: "未設定" });
  const r = describeRecordStore({ ok: false, reason: "読めませんでした（42501）" }, key);
  assert.equal(r.ok, false);
  assert.ok(r.note.includes("鍵"));
});

test("鍵が使えるのに読めないときは、鍵のせいにしない", () => {
  const key = describeServerKey({ ok: true, key: "abc" });
  const r = describeRecordStore(
    { ok: false, reason: "置き場（表）が本番にありません。SQLをまだ実行していない可能性があります" },
    key,
  );
  assert.equal(r.ok, false);
  assert.ok(!r.note.includes("鍵"));
  assert.ok(r.note.includes("SQL"));
});

test("読めているときは、そのまま読めていると出す", () => {
  const key = describeServerKey({ ok: true, key: "abc" });
  assert.deepEqual(describeRecordStore({ ok: true, reason: null }, key), {
    ok: true,
    note: "読めています",
  });
});

test("「表が無い」と「読む許可が無い」を言い分ける", () => {
  const missing = describeTableError("42P01", 'relation "site_visits" does not exist');
  const denied = describeTableError("42501", "permission denied for table site_visits");
  assert.ok(missing.includes("表）が本番にありません"));
  assert.ok(denied.includes("読む許可がありません"));
  assert.notEqual(missing, denied);
});
