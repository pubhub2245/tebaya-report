import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSignupReadiness,
  describeTableError,
  STRIPE_MANUAL_SETUP,
} from "../lib/keiri/signupReadiness";

const OK_TABLE = { ok: true, reason: null };

test("4つ全部そろっていれば ready", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: true },
    tenants: OK_TABLE,
    settings: OK_TABLE,
  });
  assert.equal(r.ready, true);
  assert.equal(r.todo.length, 0);
  assert.equal(r.checks.payment_button, true);
  assert.equal(r.checks.signup_notice, true);
});

test("合言葉が未設定なら ready にならず、やることが1件出る", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: false, reason: "未設定" },
    tenants: OK_TABLE,
    settings: OK_TABLE,
  });
  assert.equal(r.ready, false);
  assert.equal(r.todo.length, 1);
  assert.ok(r.todo[0].includes(STRIPE_MANUAL_SETUP.webhookUrl));
  assert.ok(r.todo[0].includes("KEIRI_SIGNUP_WEBHOOK_SECRET"));
});

test("全角が混ざっていたときは『貼り直す』と言う（未設定とは区別する）", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: false, reason: "全角などの使えない文字が入っている" },
    tenants: OK_TABLE,
    settings: OK_TABLE,
  });
  assert.ok(r.todo[0].includes("貼り直してください"));
});

test("置き場が無いときは、やることが積み上がる", () => {
  const r = buildSignupReadiness({
    paymentLink: null,
    secret: { ok: false, reason: "未設定" },
    tenants: { ok: false, reason: describeTableError("42P01", 'relation "keiri_tenants" does not exist') },
    settings: { ok: false, reason: describeTableError("42P01", 'relation "keiri_settings" does not exist') },
  });
  assert.equal(r.ready, false);
  assert.equal(r.todo.length, 4);
  assert.equal(r.summary, "つながっていません。残り 4 か所");
  assert.ok(r.todo[2].includes("SQLをまだ実行していない"));
});

test("表が無いときと、それ以外の読めない理由を言い分ける", () => {
  assert.ok(describeTableError("42P01", "x").includes("置き場（表）が本番にありません"));
  assert.ok(describeTableError(null, "Could not find the table 'public.keiri_tenants'").includes("置き場（表）が本番にありません"));
  // 読む許可が無いときは、直し方が違う（鍵を貼り直す）ので専用の言い方にする
  assert.ok(describeTableError("42501", "permission denied").includes("読む許可がありません"));
  // それ以外は、直し方が分からないので理由の記号をそのまま見せる
  assert.ok(describeTableError("08006", "connection failure").includes("08006"));
});

test("合言葉そのものは結果に出さない", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: true },
    tenants: OK_TABLE,
    settings: OK_TABLE,
  });
  assert.ok(!JSON.stringify(r).includes("whsec_"));
});
