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
    serverKeyUsable: true,
  });
  assert.equal(r.ready, true);
  assert.equal(r.todo.length, 0);
  assert.equal(r.checks.payment_button, true);
  assert.equal(r.checks.signup_notice, true);
  assert.equal(r.checks.shop_create, true);
});

test("合言葉が未設定なら ready にならず、やることが1件出る", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: false, reason: "未設定" },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    serverKeyUsable: true,
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
    serverKeyUsable: true,
  });
  assert.ok(r.todo[0].includes("貼り直してください"));
});

test("置き場が無いときは、やることが積み上がる", () => {
  const r = buildSignupReadiness({
    paymentLink: null,
    secret: { ok: false, reason: "未設定" },
    tenants: { ok: false, reason: describeTableError("42P01", 'relation "keiri_tenants" does not exist') },
    settings: { ok: false, reason: describeTableError("42P01", 'relation "keiri_settings" does not exist') },
    serverKeyUsable: true,
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
    serverKeyUsable: true,
  });
  assert.ok(!JSON.stringify(r).includes("whsec_"));
});

/* ---------- kp76（2026-09-19）：嘘の緑を出さない ---------- */

/**
 * お店の置き場は鍵（RLS）を掛けてあり、サーバー側の鍵でしか読み書きできません。
 * その鍵が使えないとき、読みに行っても**エラーにならず0件が返る**ので、
 * これまでは「読めました＝つながっています」と緑が出ていました。
 * 実際には、申し込んだお店は初回設定も合言葉での入室もできません。
 */
test("サーバー側の鍵が使えないときは、読めていても『つながっている』と言わない", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: true },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    serverKeyUsable: false,
  });
  assert.equal(r.ready, false);
  assert.equal(r.checks.shop_table, false);
  assert.equal(r.checks.settings_table, false);
  // 行を作れないことも、同じ鍵が原因（お願いは3回に増やさない）
  assert.equal(r.checks.shop_create, false);
  assert.equal(r.todo.length, 2);
  assert.ok(r.todo[0].includes("SUPABASE_SERVICE_ROLE_KEY"));
  // 直し方が分かる言葉で書いてあること
  assert.ok(r.todo[0].includes("初回設定"));
});

test("鍵が使えるときの見え方は、これまでと1文字も変わらない", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: true },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    serverKeyUsable: true,
  });
  assert.equal(r.ready, true);
  assert.equal(r.summary, "申し込みから使い始めまで、人の手を借りずにつながっています");
});

/**
 * 2026-09-25（kp159）：9/24 のこの文は、実際より悪く書いていました。
 *
 * Stripe の戻り先は /keiri/welcome?session={CHECKOUT_SESSION_ID} で、合言葉（t=）が
 * 付きません。この形で行が見つからないときは kp95 の道に入り、
 * 「お手続きを確認しています。担当からすぐにご連絡します」と出て、
 * スタッフのLINEへ知らせが飛び、控えにも1行残ります。
 * ＝ **行き止まり（「このリンクは使えません」）にはなりません。**
 *
 * 実際より悪く書くと、お支払いの道をつなぐこと自体をためらわせるので、
 * この2つを戻り止めにしておきます。
 */
test("行を作れないときの案内は、行き止まりだと書かない／手で始める道を書く", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: true },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    serverKeyUsable: false,
    // 倉庫の窓口（keiri_tenant_rpc.sql）は流れている＝置き場の2件は緑になる
    tenantRpcUsable: true,
  });
  assert.equal(r.ready, false);
  assert.equal(r.checks.shop_table, true);
  assert.equal(r.checks.settings_table, true);
  assert.equal(r.checks.shop_create, false);
  assert.equal(r.todo.length, 1);

  const note = r.todo[0];
  // ① 事実でないことを書かない
  assert.ok(!note.includes("このリンクは使えません"));
  // ② 何が起きるかを正しく書く（kp95 の道）
  assert.ok(note.includes("行き止まりにはなりません"));
  assert.ok(note.includes("担当からすぐにご連絡します"));
  // ③ 最初の1件を、鍵を待たずに始める道を書く
  assert.ok(note.includes("keiri_tenant_create_manual.sql"));
  // ④ 恒久的な直し方も残す
  assert.ok(note.includes("SUPABASE_SERVICE_ROLE_KEY"));
});
