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

test("読めていて鍵も生きているときだけ、記録できると言い切る", () => {
  const key = describeServerKey({ ok: true, key: "abc" });
  const r = describeRecordStore({ ok: true, reason: null }, key);
  assert.equal(r.ok, true);
  assert.equal(r.readable, true);
});

test("読めても鍵が壊れていれば、ok にしない（控えが黙って消えるのを見逃さない）", () => {
  // keiri_applications は「読むと0件が返る（エラーにならない）のに、
  // 書き込みは断られる」状態になりうる。ここを ok にすると、
  // 申し込みの控えが1行も残らないのに全部緑に見えてしまう。
  const key = describeServerKey({
    ok: false,
    reason: "全角などの使えない文字が入っている",
  });
  const r = describeRecordStore({ ok: true, reason: null }, key);
  assert.equal(r.ok, false); // ← ここが肝。読めた＝大丈夫、にしない
  assert.equal(r.readable, true); // 表そのものは在る、という事実は残す
  assert.ok(r.note.includes("言い切れません"));
});

test("読めないときは readable も false にする", () => {
  const key = describeServerKey({ ok: true, key: "abc" });
  const r = describeRecordStore(
    { ok: false, reason: "置き場（表）が本番にありません" },
    key,
  );
  assert.equal(r.readable, false);
});

test("鍵の状態は、どの説明文にも値そのものを出さない（置き場の説明でも）", () => {
  const secret = "ANOTHER-SECRET-KEY";
  const key = describeServerKey({ ok: true, key: secret });
  const r = describeRecordStore({ ok: true, reason: null }, key);
  assert.ok(!JSON.stringify(r).includes(secret));
});

test("「表が無い」と「読む許可が無い」を言い分ける", () => {
  const missing = describeTableError("42P01", 'relation "site_visits" does not exist');
  const denied = describeTableError("42501", "permission denied for table site_visits");
  assert.ok(missing.includes("表）が本番にありません"));
  assert.ok(denied.includes("読む許可がありません"));
  assert.notEqual(missing, denied);
});

test("全角を直して使えているときは、そう出す（ただし貼り直しの案内は残す）", () => {
  const r = describeServerKey(
    { ok: false, reason: "全角などの使えない文字が入っている" },
    { repaired: true, broken: { count: 3, convertible: 3 } },
  );
  assert.equal(r.configured, true);
  assert.equal(r.usable, true);
  assert.equal(r.repaired, true);
  assert.ok(r.note.includes("貼り直"));
});

test("直せなかったときは、いままでどおり『使えません』のまま", () => {
  const r = describeServerKey(
    { ok: false, reason: "全角などの使えない文字が入っている" },
    { repaired: false, broken: { count: 2, convertible: 0 } },
  );
  assert.equal(r.usable, false);
  assert.equal(r.repaired, false);
  assert.ok(r.note.includes("貼り直"));
});
