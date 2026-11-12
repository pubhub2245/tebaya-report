import assert from "node:assert/strict";
import test from "node:test";

import {
  checkAppliesOnRoute,
  checkMeaning,
  checksMeaning,
  checksNote,
} from "../lib/keiri/signupChecksMean";
import { buildSignupReadiness } from "../lib/keiri/signupReadiness";

const OK_TABLE = { ok: true, reason: null };

test("銀行振込の道では、カードだけの3つに『いまの道では使いません』が付く", () => {
  const m = checksMeaning("bank");
  for (const key of ["payment_button", "signup_notice", "shop_create"] as const) {
    assert.ok(m[key].startsWith("【いまの道（銀行振込）では使いません"), key);
    assert.equal(checkAppliesOnRoute(key, "bank"), false);
  }
});

test("置き場の2つは、どちらの道でも効く", () => {
  for (const key of ["shop_table", "settings_table"] as const) {
    assert.equal(checkAppliesOnRoute(key, "bank"), true);
    assert.equal(checkAppliesOnRoute(key, "card"), true);
    assert.ok(!checksMeaning("bank")[key].includes("使いません"));
  }
});

test("signup_notice の読み方は『申し込みが届くか』ではないと必ず言う", () => {
  for (const route of ["bank", "card"] as const) {
    const line = checkMeaning("signup_notice", route);
    assert.ok(line.includes("Stripe"));
    assert.ok(line.includes("ではありません"));
    assert.ok(line.includes("application_delivery"));
    assert.ok(line.includes("notify"));
  }
});

test("カードの道では、どれにも『使いません』が付かない", () => {
  const m = checksMeaning("card");
  for (const line of Object.values(m)) {
    assert.ok(!line.includes("いまの道（銀行振込）では使いません"));
  }
});

test("かぶせる1行は、どの道かと、届くかの見どころを言う", () => {
  const bank = checksNote("bank");
  assert.ok(bank.includes("銀行振込"));
  assert.ok(bank.includes("application_delivery"));
  assert.ok(bank.includes("notify"));
  assert.ok(checksNote("card").includes("カードの道"));
});

test("いまの本番と同じ形（銀行振込・カードはまだ）でも、数字は1つも隠さない", () => {
  const r = buildSignupReadiness({
    paymentLink: null,
    secret: { ok: false, reason: "未設定" },
    tenants: OK_TABLE,
    settings: OK_TABLE,
    serverKeyUsable: false,
    tenantRpcUsable: true,
    applicationDeliveryOk: true,
  });
  assert.equal(r.route, "bank");
  assert.equal(r.ready, true);
  // 数字（facts）はそのまま
  assert.equal(r.checks.payment_button, false);
  assert.equal(r.checks.signup_notice, false);
  assert.equal(r.checks.shop_create, false);
  // 読み方が付いていて、食い違って見えない
  assert.ok(r.checks_mean.signup_notice.includes("いまの道（銀行振込）では使いません"));
  assert.ok(r.checks_note.includes("application_delivery"));
});
