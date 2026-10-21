/**
 * 「払ったお金の記録」と「数えない印を元に戻す」を、お店ごとに正しく扱えているか
 * （lib/keiri/paymentWrite.ts・lib/keiri/expenseIgnoreWrite.ts／2026-10-21・f3-3・f3-4）。
 *
 * ■ ここで守ること
 *   ① 入れる1行には必ず「どのお店のものか」の印が付く（手羽屋は空＝今までどおり）
 *   ② 棚に印の欄がまだ無いとき、手羽屋は今までどおり入れ直す／よその店は**入れない**
 *      （印なしで入れると、よその店の給与が手羽屋の帳簿に紛れ込む）
 *   ③ 「元に戻す」は、よその店では**押す前に止める**（0行しか直らず嘘になるため）
 *   ※ 金額はすべて作り物です。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  PAYMENT_SHELF_STEPS,
  paymentReadBackAllowed,
  paymentRowForScope,
  planWhenTenantColumnMissing,
} from "../lib/keiri/paymentWrite";
import { decideIgnoreUndo } from "../lib/keiri/expenseIgnoreWrite";
import { effectiveKeiriScope } from "../lib/keiri/readSource";

const TENANT = "11111111-1111-1111-1111-111111111111";

const base = {
  business_type_code: "tebaya",
  paid_on: "2026-09-25",
  amount: 120000,
  kind: "payroll",
  memo: null as string | null,
};

test("手羽屋が入れる1行は、印が空（＝今までと同じ中身）", () => {
  const row = paymentRowForScope(base, null);
  assert.equal(row.tenant_id, null);
  assert.equal(row.amount, 120000);
  assert.equal(row.business_type_code, "tebaya");
});

test("申し込んだお店が入れる1行には、そのお店の印が付く", () => {
  const row = paymentRowForScope({ ...base, business_type_code: `t_${TENANT}` }, TENANT);
  assert.equal(row.tenant_id, TENANT);
  // ★印を付けても、もとの中身は1つも書き換えない
  assert.equal(row.paid_on, "2026-09-25");
  assert.equal(row.kind, "payroll");
});

test("印の欄がまだ無いとき：手羽屋は今までどおり入れ直す", () => {
  const plan = planWhenTenantColumnMissing({ isTebaya: true });
  assert.equal(plan.action, "印なしで入れ直す");
});

test("印の欄がまだ無いとき：よその店は入れない（手羽屋の帳簿に紛れ込ませない）", () => {
  const plan = planWhenTenantColumnMissing({ isTebaya: false });
  assert.equal(plan.action, "入れない");
  if (plan.action !== "入れない") return;
  // 「保存しました」と言わず、理由が出ること
  assert.match(plan.message, /保存できませんでした/);
  assert.match(plan.message, /何も入れていません/);
});

test("入れたあとの番号の読み返しは、手羽屋だけ", () => {
  assert.equal(paymentReadBackAllowed({ isTebaya: true }), true);
  assert.equal(paymentReadBackAllowed({ isTebaya: false }), false);
});

test("貼り紙の段は、欄を足すのが⑨・締めるのが⑪", () => {
  assert.equal(PAYMENT_SHELF_STEPS.column, "⑨");
  assert.equal(PAYMENT_SHELF_STEPS.scoped, "⑪");
});

test("「元に戻す」：手羽屋は今までどおり押せる", () => {
  const v = decideIgnoreUndo({ isTebaya: true });
  assert.equal(v.allowed, true);
  assert.equal(v.message, null);
});

test("「元に戻す」：よその店は押す前に止め、「戻しました」と言わない", () => {
  const v = decideIgnoreUndo({ isTebaya: false });
  assert.equal(v.allowed, false);
  assert.ok(v.message);
  assert.match(v.message ?? "", /元に戻せません/);
  assert.match(v.message ?? "", /印は消えていません/);
});

/* ------------------------------------------------------------------ *
 *  日報（/report）が「どのお店か」を決めるときの安全側の決め方
 *  （lib/keiri/readSource.ts の effectiveKeiriScope を日報でも使う・2026-10-21・f3-4）
 * ------------------------------------------------------------------ */

test("日報：手羽屋は、入室の印が無いので端末の控えのまま（今までと同じ）", () => {
  const store = { getItem: () => null };
  assert.equal(effectiveKeiriScope(null, store), null);
});

test("日報：入室の印がお店なら、端末の控えが空でもお店として扱う", () => {
  const store = { getItem: () => TENANT };
  assert.equal(effectiveKeiriScope(null, store), TENANT);
});

test("日報：端末の控えがお店なら、入室の印が無くてもお店として扱う", () => {
  const store = { getItem: () => null };
  assert.equal(effectiveKeiriScope(TENANT, store), TENANT);
});
