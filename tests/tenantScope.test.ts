/**
 * 「どの店の日報か」の印（テナント）のテスト。
 *
 * ここでいちばん確かめたいのは1つだけ：
 * **手羽屋にとって、絞る前と後で見えるものが1行も変わらないこと。**
 * 手羽屋が毎日使っている画面に手を入れる工事なので、ここを固定しておく。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  TEBAYA_SCOPE,
  TEBAYA_BUSINESS_CODE,
  TENANT_COLUMN,
  applyTenantScope,
  businessCodeForScope,
  normalizeTenantScope,
  readTenantScope,
  rowsInScope,
  tenantStamp,
  writeTenantScope,
} from "../lib/tenantScope";
import { tenantBusinessCode } from "../lib/keiri/tenants";

const SHOP_A = "11111111-2222-4333-8444-555555555555";
const SHOP_B = "99999999-8888-4777-8666-555555555555";

/* ---------- 印の読み取り ---------- */

test("normalizeTenantScope: 空・形の違う値は手羽屋（null）に倒す", () => {
  assert.equal(normalizeTenantScope(null), null);
  assert.equal(normalizeTenantScope(""), null);
  assert.equal(normalizeTenantScope("  "), null);
  assert.equal(normalizeTenantScope("tebaya"), null);
  assert.equal(normalizeTenantScope("' or 1=1 --"), null);
  assert.equal(normalizeTenantScope(SHOP_A), SHOP_A);
});

test("normalizeTenantScope: 大文字で来ても同じ印として扱う", () => {
  assert.equal(normalizeTenantScope(SHOP_A.toUpperCase()), SHOP_A);
});

/* ---------- 業態コード ---------- */

test("businessCodeForScope: 手羽屋は今までどおり 'tebaya'", () => {
  assert.equal(businessCodeForScope(TEBAYA_SCOPE), TEBAYA_BUSINESS_CODE);
  assert.equal(businessCodeForScope(TEBAYA_SCOPE), "tebaya");
});

test("businessCodeForScope: よそのお店は lib/keiri/tenants.ts と同じ形になる", () => {
  assert.equal(businessCodeForScope(SHOP_A), tenantBusinessCode(SHOP_A));
});

/* ---------- 保存するときの印 ---------- */

test("tenantStamp: 手羽屋の日報には印を付けない（null＝今までと同じ中身）", () => {
  assert.deepEqual(tenantStamp(TEBAYA_SCOPE), { tenant_id: null });
});

test("tenantStamp: よそのお店の日報にはそのお店の印を付ける", () => {
  assert.deepEqual(tenantStamp(SHOP_A), { tenant_id: SHOP_A });
});

/* ---------- 問い合わせへの絞り込み ---------- */

/** Supabase の問い合わせの偽物。どんな絞り込みが足されたかを記録する */
function fakeQuery() {
  const calls: string[] = [];
  const q: any = {
    calls,
    is(col: string, val: null) {
      calls.push(`is(${col},${String(val)})`);
      return q;
    },
    eq(col: string, val: string) {
      calls.push(`eq(${col},${val})`);
      return q;
    },
  };
  return q;
}

test("applyTenantScope: 手羽屋は『印が空のものだけ』で絞る", () => {
  const q = fakeQuery();
  applyTenantScope(q, TEBAYA_SCOPE);
  assert.deepEqual(q.calls, [`is(${TENANT_COLUMN},null)`]);
});

test("applyTenantScope: よそのお店はその印だけで絞る", () => {
  const q = fakeQuery();
  applyTenantScope(q, SHOP_A);
  assert.deepEqual(q.calls, [`eq(${TENANT_COLUMN},${SHOP_A})`]);
});

test("applyTenantScope: 絞り込みを足した同じ問い合わせを返す（つなげて書ける）", () => {
  const q = fakeQuery();
  assert.equal(applyTenantScope(q, SHOP_A), q);
});

/* ---------- いちばん大事：手羽屋の見えるものが変わらない ---------- */

test("手羽屋：いまある日報（印が空）は、絞っても1行も減らない", () => {
  // 工事の前に入っていた日報は、すべて印が空になる
  const before = [
    { id: 1, tenant_id: null, sales_amount: 42000 },
    { id: 2, tenant_id: null, sales_amount: 31000 },
    { id: 3, tenant_id: null, sales_amount: 55000 },
  ];
  assert.deepEqual(rowsInScope(before, TEBAYA_SCOPE), before);
});

test("手羽屋：印の列がまだ無い形の行（undefined）も、手羽屋のものとして残る", () => {
  const rows = [{ id: 1 }, { id: 2 }] as { id: number; tenant_id?: string | null }[];
  assert.deepEqual(rowsInScope(rows, TEBAYA_SCOPE), rows);
});

test("手羽屋の画面によそのお店の日報が混ざらない", () => {
  const rows = [
    { id: 1, tenant_id: null },
    { id: 2, tenant_id: SHOP_A },
    { id: 3, tenant_id: null },
    { id: 4, tenant_id: SHOP_B },
  ];
  assert.deepEqual(
    rowsInScope(rows, TEBAYA_SCOPE).map((r) => r.id),
    [1, 3],
  );
});

test("よそのお店の画面に手羽屋の売上が出ない", () => {
  const rows = [
    { id: 1, tenant_id: null, sales_amount: 999999 }, // 手羽屋
    { id: 2, tenant_id: SHOP_A, sales_amount: 12000 },
    { id: 3, tenant_id: SHOP_B, sales_amount: 8000 },
  ];
  const seen = rowsInScope(rows, SHOP_A);
  assert.deepEqual(seen.map((r) => r.id), [2]);
  assert.equal(
    seen.some((r) => r.sales_amount === 999999),
    false,
  );
});

test("よそのお店同士も混ざらない", () => {
  const rows = [
    { id: 2, tenant_id: SHOP_A },
    { id: 3, tenant_id: SHOP_B },
  ];
  assert.deepEqual(rowsInScope(rows, SHOP_B).map((r) => r.id), [3]);
});

/* ---------- ブラウザの控え ---------- */

/** localStorage の偽物 */
function fakeStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

test("readTenantScope: 控えが空なら手羽屋", () => {
  assert.equal(readTenantScope(fakeStore()), null);
});

test("readTenantScope / writeTenantScope: お店の印を控えて読み戻せる", () => {
  const store = fakeStore();
  writeTenantScope(SHOP_A, store);
  assert.equal(readTenantScope(store), SHOP_A);
});

test("writeTenantScope: null を書くと手羽屋に戻る（控えを消す）", () => {
  const store = fakeStore();
  writeTenantScope(SHOP_A, store);
  writeTenantScope(null, store);
  assert.equal(readTenantScope(store), null);
});

test("readTenantScope: 控えが壊れていても落ちず、手羽屋に倒す", () => {
  assert.equal(readTenantScope(fakeStore({ "keiri-tenant-id": "こわれた値" })), null);
  const broken = {
    getItem() {
      throw new Error("プライベートウィンドウでは読めません");
    },
  };
  assert.equal(readTenantScope(broken), null);
});

/* ---------- 画面の側の作りを固定する（工事の取りこぼし防止） ---------- */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** app/ と lib/ の中の .ts / .tsx を全部あつめる */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

/**
 * 日報の棚を読む所には、必ず「どの店か」の絞り込みが付いていること。
 *
 * ★これが無い所が1つでもあると、
 *   手羽屋の画面によそのお店の日報が混ざる（またはその逆）ので、
 *   工事の取りこぼしをここで止める。
 *
 * ★除外してよいのは「1件を id で直接さわる所」だけ
 *   （id は1つしか無いので、よそのお店のものを引く心配が無い）。
 */
const ALLOWED_WITHOUT_SCOPE = new Set([
  // 日報1件の編集・削除（id 指定なので混ざらない）
  "app/components/EditReportModal.tsx",
  "app/report/edit/page.tsx",
  "app/admin/page.tsx", // 一覧は絞ってある。残りは削除（id 指定）
  // 管理者の手入れ（レシート写真の引っ越し・読み直し）。
  // 全部の行を直す道具なので、ここは絞らないのが正しい。
  "lib/receiptMigration.ts",
  "app/api/admin/reocr-receipts/route.ts",
]);

test("日報を読む所には必ず『どの店か』の絞り込みが付いている", () => {
  const missing: string[] = [];
  for (const file of [...sourceFiles("app"), ...sourceFiles("lib")]) {
    const src = readFileSync(file, "utf8");
    if (!src.includes('.from("daily_reports")') && !src.includes('.from("keiri_reports")')) {
      continue;
    }
    const rel = file.replace(/\\/g, "/");
    if (ALLOWED_WITHOUT_SCOPE.has(rel)) continue;
    const scoped =
      src.includes('.is("tenant_id", null)') || src.includes("applyTenantScope");
    if (!scoped) missing.push(rel);
  }
  assert.deepEqual(
    missing,
    [],
    `次のファイルに「どの店か」の絞り込みが付いていません：\n${missing.join("\n")}`,
  );
});

test("日報を保存する所では「どの店か」の印を付けている", () => {
  const src = readFileSync("app/report/page.tsx", "utf8");
  assert.ok(
    src.includes("tenantStamp(readTenantScope())"),
    "app/report/page.tsx の insert に tenantStamp が付いていません",
  );
});
