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

test("置き場が無いときは、やることが積み上がる（カードの道）", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: false, reason: "未設定" },
    tenants: { ok: false, reason: describeTableError("42P01", 'relation "keiri_tenants" does not exist') },
    settings: { ok: false, reason: describeTableError("42P01", 'relation "keiri_settings" does not exist') },
    serverKeyUsable: true,
  });
  assert.equal(r.route, "card");
  assert.equal(r.ready, false);
  assert.equal(r.todo.length, 3);
  assert.equal(r.summary, "つながっていません。残り 3 か所");
  assert.ok(r.todo[1].includes("SQLをまだ実行していない"));
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


/* ---------- 2026-09-26（B）：銀行振込の道を、カードの道と混ぜない ---------- */

/**
 * いまのお支払い方法は**銀行振込**です（2026-09-25・kp181）。
 * それなのにこの判定はカードの道だけを見ていて、本番は
 * 「お申し込みを受け付けられる」状態なのに
 * 「つながっていません。残り3か所」と出し続けていました。
 * その3か所は全部カードの道の話で、いま要らないものです。
 *
 * 要らないものを「残り」に数えると、要らない手続き（カードの受付口づくり）に
 * 人を向かわせ、いちばん大事な「1軒に送る」から目を離させます。
 */
test("支払いリンクが無いときは銀行振込の道で見る。置き場が使えるなら受け付けられる", () => {
  const r = buildSignupReadiness({
    paymentLink: null,
    secret: { ok: false, reason: "未設定" },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    // 鍵は壊れている（本番のいまの状態）
    serverKeyUsable: false,
    // 倉庫の窓口は流れている＝お店は初回設定と入室ができる
    tenantRpcUsable: true,
    applicationDeliveryOk: true,
  });
  assert.equal(r.route, "bank");
  assert.equal(r.ready, true);
  assert.equal(r.todo.length, 0);
  assert.ok(r.summary.includes("銀行振込でお申し込みを受け付けられます"));
  // 手で行う手順は「欠けているもの」ではないので、残りに数えない
  assert.equal(r.manual_steps.length, 2);
  assert.ok(r.manual_steps[0].includes("keiri_tenant_create_manual"));
  assert.ok(r.manual_steps[1].includes("お振込先"));
});

test("カードの残りは隠さない。ready には入れず card.todo に全部出す", () => {
  const r = buildSignupReadiness({
    paymentLink: null,
    secret: { ok: false, reason: "未設定" },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    serverKeyUsable: false,
    tenantRpcUsable: true,
  });
  assert.equal(r.card.ready, false);
  // 支払いリンク・支払いの通知・行の自動づくり の3件
  assert.equal(r.card.todo.length, 3);
  assert.ok(r.card.todo[0].includes("NEXT_PUBLIC_KEIRI_PAYMENT_LINK"));
  assert.ok(r.card.todo[1].includes("KEIRI_SIGNUP_WEBHOOK_SECRET"));
  assert.ok(r.card.todo[2].includes("SUPABASE_SERVICE_ROLE_KEY"));
  // facts（checks）は1つも隠さない
  assert.equal(r.checks.payment_button, false);
  assert.equal(r.checks.signup_notice, false);
  assert.equal(r.checks.shop_create, false);
});

/**
 * 銀行振込の道では、申し込みに気づく道は「スタッフのLINE」と「倉庫の控え」の2本だけです
 * （カードの支払い通知が無いため）。両方死んでいると、受け付けた顔をして誰にも届きません。
 * ここだけは、送るのを止めてもらう必要があるので赤くします。
 */
test("入った申し込みがどこにも届かないときは、銀行振込の道でも赤くする", () => {
  const r = buildSignupReadiness({
    paymentLink: null,
    secret: { ok: true },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    serverKeyUsable: true,
    applicationDeliveryOk: false,
  });
  assert.equal(r.route, "bank");
  assert.equal(r.ready, false);
  assert.equal(r.todo.length, 1);
  assert.ok(r.todo[0].includes("どこにも届きません"));
  assert.ok(r.todo[0].includes("1軒目に送るのは止めてください"));
});

test("調べていないとき（渡されなかったとき）は『届かない』と書かない", () => {
  const r = buildSignupReadiness({
    paymentLink: null,
    secret: { ok: true },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    serverKeyUsable: true,
  });
  assert.equal(r.ready, true);
  assert.equal(r.todo.length, 0);
});

test("支払いリンクが入った日は、これまでどおりカードの道で判定する", () => {
  const r = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: true },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    serverKeyUsable: true,
  });
  assert.equal(r.route, "card");
  assert.equal(r.ready, true);
  assert.equal(r.summary, "申し込みから使い始めまで、人の手を借りずにつながっています");
  assert.equal(r.manual_steps.length, 0);
  assert.equal(r.card.ready, true);
});
