/**
 * 経理パッケージ「無人販売の入口③：自動初期設定」のテスト。
 *
 * 守りたいこと（ここが崩れたら事故になる）：
 *  1. 同じ通知が2回来ても、お店は1軒しか作らない
 *  2. 署名（本物かどうかの印）が合わない通知は受け取らない
 *  3. 古い通知の使い回しは受け取らない
 *  4. 生の合言葉は倉庫に入れない（ハッシュだけ）
 *  5. 初回設定の金額は勝手に作らない（読めない値はエラーにして人に入れ直させる）
 *  6. 失敗しても 200 を返す（同じ通知が何度も送り直されるのを防ぐ）
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  buildTenant,
  checkWelcomeInput,
  cleanShopName,
  generateAdminPassword,
  generateSetupToken,
  hashSecret,
  secretMatches,
  verifyStripeSignature,
  type KeiriTenantRow,
} from "../lib/keiri/tenants";
import {
  handleSignupWebhook,
  isSignupEvent,
  readStripeEvent,
} from "../lib/keiri/signupWebhook";

const SECRET = "whsec_test_abcdefghijklmnopqrstuvwxyz";

/** Stripe と同じやり方で署名ヘッダーを作る（テスト用） */
function signHeader(body: string, ts: number, secret = SECRET): string {
  const v1 = createHmac("sha256", secret).update(`${ts}.${body}`, "utf8").digest("hex");
  return `t=${ts},v1=${v1}`;
}

function completedEvent(subscriptionId: string, sessionId = "cs_test_1") {
  return JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        customer: "cus_1",
        subscription: subscriptionId,
        customer_details: { name: "テスト商店" },
      },
    },
  });
}

// ------------------------------------------------------------------
// 合言葉まわり
// ------------------------------------------------------------------

test("合言葉は見間違えやすい文字（0 O 1 l i）を使わない", () => {
  for (let i = 0; i < 50; i++) {
    const pw = generateAdminPassword().replace(/-/g, "");
    assert.match(pw, /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/);
  }
});

test("初回設定の合言葉は毎回ちがう長い文字列", () => {
  const a = generateSetupToken();
  const b = generateSetupToken();
  assert.equal(a.length, 32);
  assert.notEqual(a, b);
});

test("合言葉は戻せない形で保存し、合っているか確かめられる", () => {
  const pw = generateAdminPassword();
  const hash = hashSecret(pw);
  assert.notEqual(hash, pw);
  assert.ok(secretMatches(pw, hash));
  assert.ok(!secretMatches(pw + "x", hash));
  assert.ok(!secretMatches(pw, ""));
});

test("作ったお店の行に、生の合言葉は入っていない", () => {
  const created = buildTenant({ source: "stripe", subscriptionId: "sub_1", shopName: " テスト商店 " });
  assert.equal(created.row.admin_password_hash, null);
  assert.equal(created.row.shop_name, "テスト商店");
  assert.equal(created.row.template, "generic");
  assert.equal(created.row.status, "pending");
  assert.ok(created.setupPath.startsWith("/keiri/welcome?t="));
});

test("店名は前後の空白を取り、長すぎるものは切る。空なら null", () => {
  assert.equal(cleanShopName("  ○○ 商店  "), "○○ 商店");
  assert.equal(cleanShopName("   "), null);
  assert.equal(cleanShopName(undefined), null);
  assert.equal(cleanShopName("あ".repeat(100))?.length, 60);
});

// ------------------------------------------------------------------
// 署名（本物かどうかの印）
// ------------------------------------------------------------------

test("正しい署名なら本物と分かる", () => {
  const body = completedEvent("sub_1");
  const now = 1_800_000_000;
  assert.ok(verifyStripeSignature(body, signHeader(body, now), SECRET, now));
});

test("本文が1文字でも違えば受け取らない", () => {
  const body = completedEvent("sub_1");
  const now = 1_800_000_000;
  const header = signHeader(body, now);
  assert.ok(!verifyStripeSignature(body + " ", header, SECRET, now));
});

test("合言葉が違えば受け取らない", () => {
  const body = completedEvent("sub_1");
  const now = 1_800_000_000;
  const header = signHeader(body, now, "whsec_other");
  assert.ok(!verifyStripeSignature(body, header, SECRET, now));
});

test("古い通知の使い回しは受け取らない（5分より前）", () => {
  const body = completedEvent("sub_1");
  const signedAt = 1_800_000_000;
  const header = signHeader(body, signedAt);
  assert.ok(!verifyStripeSignature(body, header, SECRET, signedAt + 301));
  assert.ok(verifyStripeSignature(body, header, SECRET, signedAt + 299));
});

test("署名ヘッダーが無い・壊れているときは受け取らない", () => {
  const body = completedEvent("sub_1");
  assert.ok(!verifyStripeSignature(body, null, SECRET));
  assert.ok(!verifyStripeSignature(body, "", SECRET));
  assert.ok(!verifyStripeSignature(body, "t=,v1=", SECRET));
  assert.ok(!verifyStripeSignature(body, "v1=abc", SECRET));
  assert.ok(!verifyStripeSignature(body, "t=abc,v1=def", SECRET));
});

// ------------------------------------------------------------------
// 通知の読み取り
// ------------------------------------------------------------------

test("通知から必要な項目だけ取り出す", () => {
  const ev = readStripeEvent(JSON.parse(completedEvent("sub_9", "cs_9")));
  assert.equal(ev.type, "checkout.session.completed");
  assert.equal(ev.subscriptionId, "sub_9");
  assert.equal(ev.sessionId, "cs_9");
  assert.equal(ev.customerId, "cus_1");
  assert.equal(ev.shopName, "テスト商店");
});

test("支払い完了以外の通知は対象にしない", () => {
  assert.ok(isSignupEvent("checkout.session.completed"));
  assert.ok(!isSignupEvent("invoice.paid"));
  assert.ok(!isSignupEvent(""));
});

// ------------------------------------------------------------------
// 受け口の動き
// ------------------------------------------------------------------

function deps(overrides: Partial<Parameters<typeof handleSignupWebhook>[1]> = {}) {
  const created: KeiriTenantRow[] = [];
  const base = {
    webhookSecret: SECRET,
    alreadyExists: async () => false,
    createTenant: async (row: KeiriTenantRow) => {
      created.push(row);
    },
    nowSeconds: 1_800_000_000,
    log: () => {},
    logError: () => {},
  };
  return { deps: { ...base, ...overrides }, created };
}

test("正しい通知でお店が1軒できる", async () => {
  const body = completedEvent("sub_1");
  const { deps: d, created } = deps();
  const res = await handleSignupWebhook({ bodyText: body, signature: signHeader(body, 1_800_000_000) }, d);
  assert.equal(res.status, 200);
  assert.equal(res.body.handled, true);
  assert.equal(created.length, 1);
  // 返事の中に合言葉やURLを含めない（記録に残さないため）
  assert.equal(res.body.setup_path, undefined);
  assert.equal(res.body.admin_password, undefined);
});

test("同じ申し込みが既にあれば作らない（同じ通知が2回来ても1軒）", async () => {
  const body = completedEvent("sub_1");
  const { deps: d, created } = deps({ alreadyExists: async () => true });
  const res = await handleSignupWebhook({ bodyText: body, signature: signHeader(body, 1_800_000_000) }, d);
  assert.equal(res.status, 200);
  assert.equal(res.body.handled, false);
  assert.equal(res.body.reason, "重複");
  assert.equal(created.length, 0);
});

test("署名が合わなければ 401 で、何も作らない", async () => {
  const body = completedEvent("sub_1");
  const { deps: d, created } = deps();
  const res = await handleSignupWebhook({ bodyText: body, signature: "t=1,v1=deadbeef" }, d);
  assert.equal(res.status, 401);
  assert.equal(created.length, 0);
});

test("合言葉が未設定なら 500（気づけるように止める）", async () => {
  const body = completedEvent("sub_1");
  const { deps: d } = deps({ webhookSecret: undefined });
  const res = await handleSignupWebhook({ bodyText: body, signature: signHeader(body, 1_800_000_000) }, d);
  assert.equal(res.status, 500);
});

test("対象外の通知は何もせず 200", async () => {
  const body = JSON.stringify({ id: "evt_2", type: "invoice.paid", data: { object: {} } });
  const { deps: d, created } = deps();
  const res = await handleSignupWebhook({ bodyText: body, signature: signHeader(body, 1_800_000_000) }, d);
  assert.equal(res.status, 200);
  assert.equal(res.body.handled, false);
  assert.equal(created.length, 0);
});

test("保存に失敗しても 200 を返す（同じ通知の送り直しを止める）", async () => {
  const body = completedEvent("sub_1");
  const { deps: d } = deps({
    createTenant: async () => {
      throw new Error("倉庫が応答しない");
    },
  });
  const res = await handleSignupWebhook({ bodyText: body, signature: signHeader(body, 1_800_000_000) }, d);
  assert.equal(res.status, 200);
  assert.equal(res.body.reason, "保存に失敗");
});

test("本文が読めなくても 200", async () => {
  const body = "これはJSONではない";
  const { deps: d } = deps();
  const res = await handleSignupWebhook({ bodyText: body, signature: signHeader(body, 1_800_000_000) }, d);
  assert.equal(res.status, 200);
  assert.equal(res.body.handled, false);
});

// ------------------------------------------------------------------
// 初回設定の3項目
// ------------------------------------------------------------------

test("初回設定の3項目：正しければ通る", () => {
  const r = checkWelcomeInput({ shopName: "○○商店", openingDate: "2026-10-01", openingBalance: "30,000円" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.shopName, "○○商店");
    assert.equal(r.value.openingDate, "2026-10-01");
    assert.equal(r.value.openingBalance, 30000);
  }
});

test("初回設定の3項目：0円は通る", () => {
  const r = checkWelcomeInput({ shopName: "店", openingDate: "2026-10-01", openingBalance: "0" });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.openingBalance, 0);
});

test("初回設定の3項目：足りない・読めない値は通さない（勝手に作らない）", () => {
  assert.ok(!checkWelcomeInput({ shopName: "", openingDate: "2026-10-01", openingBalance: "0" }).ok);
  assert.ok(!checkWelcomeInput({ shopName: "店", openingDate: "2026/10/01", openingBalance: "0" }).ok);
  assert.ok(!checkWelcomeInput({ shopName: "店", openingDate: "2026-02-31", openingBalance: "0" }).ok);
  assert.ok(!checkWelcomeInput({ shopName: "店", openingDate: "2026-10-01", openingBalance: "" }).ok);
  assert.ok(!checkWelcomeInput({ shopName: "店", openingDate: "2026-10-01", openingBalance: "だいたい3万" }).ok);
  assert.ok(!checkWelcomeInput({ shopName: "店", openingDate: "2026-10-01", openingBalance: "-100" }).ok);
  assert.ok(
    !checkWelcomeInput({ shopName: "店", openingDate: "2026-10-01", openingBalance: "999999999" }).ok,
  );
});
