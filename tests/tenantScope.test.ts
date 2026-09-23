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
  isTebayaScope,
  TABLES_WITHOUT_TENANT_COLUMN,
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

/* ---------- 選択肢の棚（出店場所・担当者・商品）も店ごとに分ける（kp42） ---------- */

/**
 * 日報で選ぶ「出店場所」「担当者」「商品と単価」の棚を読む所にも、
 * 必ず「どの店か」の絞り込みが付いていること。
 *
 * ★これが無いと、
 *   ・申し込んだお店の日報に「ながやま三股」「イデ」「手羽先」が並ぶ（使えない）
 *   ・そのお店が自分の場所を足すと、手羽屋の日報にもそれが並ぶ
 *   の両方が起きる。
 */
const MASTER_TABLES = [
  '.from("locations")',
  '.from("staff_members")',
  '.from("sale_products")',
];

/** 絞らなくてよい所（id で1件だけさわる・名前の言い換え表など、混ざりようが無い所） */
const MASTER_ALLOWED_WITHOUT_SCOPE = new Set<string>([]);

test("選択肢の棚（出店場所・担当者・商品）を読む所にも『どの店か』の絞り込みが付いている", () => {
  const missing: string[] = [];
  for (const file of [...sourceFiles("app"), ...sourceFiles("lib")]) {
    const src = readFileSync(file, "utf8");
    if (!MASTER_TABLES.some((t) => src.includes(t))) continue;
    const rel = file.replace(/\\/g, "/");
    if (MASTER_ALLOWED_WITHOUT_SCOPE.has(rel)) continue;
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

test("選択肢を足す所では「どの店か」の印を付けている", () => {
  for (const file of [
    "app/components/LocationMaster.tsx",
    "app/components/StaffMaster.tsx",
    "app/components/ProductMaster.tsx",
    "app/report/page.tsx",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.ok(
      src.includes("tenantStamp(readTenantScope())"),
      `${file} の insert に tenantStamp が付いていません`,
    );
  }
});

test("手羽屋のスタッフ名（コードの保険の一覧）は、よそのお店の日報に出さない", () => {
  const src = readFileSync("app/report/page.tsx", "utf8");
  // scope（＝よそのお店）のときは masterStaff だけを渡している
  assert.ok(
    /staffOptions=\{\s*scope\s*\?\s*masterStaff/.test(src),
    "よそのお店のときも STAFF_OPTIONS（イデ・じゅん…）が選択肢に入っています",
  );
});

test("手羽屋（印が空）の選択肢は、絞っても1件も減らない", () => {
  // いまある出店場所・担当者・商品はすべて印が空（null）。
  // 「印が空のものだけ」で絞った結果は、絞る前と同じであることを固定する。
  const locations = [
    { name: "ながやま三股", tenant_id: null },
    { name: "PASIO高城", tenant_id: null },
    { name: "よその店の会場", tenant_id: "11111111-1111-4111-8111-111111111111" },
  ];
  const tebaya = rowsInScope(locations, TEBAYA_SCOPE);
  assert.equal(tebaya.length, 2);
  assert.deepEqual(
    tebaya.map((l) => l.name),
    ["ながやま三股", "PASIO高城"],
  );
  // よその店の画面には、そのお店のぶんだけ
  const other = rowsInScope(locations, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(
    other.map((l) => l.name),
    ["よその店の会場"],
  );
});

/* ---------- 合言葉の要らない画面で「日報の一覧」を出す所（kp117） ---------- */

/**
 * 合言葉（管理者パスワード）が要らない画面は、経理パッケージを申し込んだお店の
 * スタッフもそのまま開ける。そこで日報を**一覧として**読むなら、
 * 必ず「どの店か」の絞り込みが要る。
 *
 * ★これが無いと /report/edit で
 *   ・申し込んだお店のスタッフに、手羽屋の日報（日付・場所・担当・売上）が並び、
 *     「修正」を押せば中身まで直せる
 *   ・手羽屋のスタッフの一覧にも、よそのお店の日報が混ざる
 *   の両方が起きる（2026-09-24 実測して直した）。
 */
const REPORT_TABLE = '.from("daily_reports")';

const OPEN_SCREENS_LISTING_REPORTS = [
  "app/report/page.tsx",
  "app/report/edit/page.tsx",
  "app/interim/page.tsx",
];

/** 日報の棚を「1件だけ」さわる書き方（混ざりようが無いので絞らなくてよい） */
const BY_ID_ONLY = /\.eq\("id",/;

test("合言葉の要らない画面で日報を一覧にする所には、必ず『どの店か』の絞り込みが付いている", () => {
  const missing: string[] = [];
  for (const file of OPEN_SCREENS_LISTING_REPORTS) {
    const src = readFileSync(file, "utf8");
    // その画面の中の「日報の棚を読む・書く」所を1つずつ見る
    for (let i = src.indexOf(REPORT_TABLE); i >= 0; i = src.indexOf(REPORT_TABLE, i + 1)) {
      const before = src.slice(Math.max(0, i - 400), i);
      const after = src.slice(i, i + 400);
      // id で1件だけさわる所は、よその店のものが混ざりようが無い
      if (BY_ID_ONLY.test(after)) continue;
      const scoped =
        /applyTenantScope[<(]/.test(before) ||
        after.includes('.is("tenant_id", null)') ||
        after.includes("tenantStamp(");
      if (!scoped) {
        const line = src.slice(0, i).split("\n").length;
        missing.push(`${file}:${line}`);
      }
    }
  }
  assert.deepEqual(
    missing,
    [],
    `次の所に「どの店か」の絞り込みが付いていません：\n${missing.join("\n")}`,
  );
});

test("日報の一覧を絞っても、手羽屋の行は1行も減らない", () => {
  // /report/edit は「直近60件」を出す画面。印が空のものだけで絞った結果が、
  // 手羽屋にとって絞る前と同じであることを固定する。
  const reports = [
    { date: "2026-09-20", location: "ながやま三股", tenant_id: null },
    { date: "2026-09-21", location: "PASIO高城", tenant_id: null },
    { date: "2026-09-22", location: "よその店の会場", tenant_id: SHOP_A },
  ];
  assert.deepEqual(
    rowsInScope(reports, TEBAYA_SCOPE).map((r) => r.location),
    ["ながやま三股", "PASIO高城"],
  );
  assert.deepEqual(
    rowsInScope(reports, SHOP_A).map((r) => r.location),
    ["よその店の会場"],
  );
});

/* ---------- 印の欄がまだ無い棚（出店予定・現場の立替）を守る門 ---------- */

/**
 * `shifts`（出店予定）と `keiri_advance_expenses`（現場の立替）の2つには、
 * 「どの店のものか」の印の欄が**まだ棚そのものに無い**。
 * 絞りようが無いので、その画面は手羽屋以外には開かない（TebayaOnlyGate）。
 *
 * ★これが無いと
 *   ・申し込んだお店のスタッフに、手羽屋の出店予定（日付・場所・担当）と
 *     立替（払った人・金額・レシート写真）がそのまま見える
 *   ・逆に、申し込んだお店が入れた予定・立替が、手羽屋の画面に混ざる
 *   の両方が起きる（2026-09-24 実測して直した）。
 */

test("isTebayaScope: 手羽屋だけ true。よそのお店は false", () => {
  assert.equal(isTebayaScope(TEBAYA_SCOPE), true);
  assert.equal(isTebayaScope(""), true); // 形が違う値は手羽屋に倒す
  assert.equal(isTebayaScope("tebaya"), true);
  assert.equal(isTebayaScope(SHOP_A), false);
  assert.equal(isTebayaScope(SHOP_A.toUpperCase()), false);
});

test("印の欄がまだ無い棚の一覧に、出店予定と現場の立替が入っている", () => {
  assert.deepEqual([...TABLES_WITHOUT_TENANT_COLUMN], [
    "shifts",
    "keiri_advance_expenses",
  ]);
});

/** 印の欄が無い棚を読む画面と、そこに掛けた門 */
const GATED_SCREENS: { file: string; table: string }[] = [
  // 出店予定。ShiftsView / VenuesView を包んでいるのが CombinedClient
  { file: "app/shifts/CombinedClient.tsx", table: "shifts" },
  { file: "app/keiri/advances/page.tsx", table: "keiri_advance_expenses" },
];

test("印の欄が無い棚の画面には、手羽屋だけに開く門が掛かっている", () => {
  for (const { file } of GATED_SCREENS) {
    const src = readFileSync(file, "utf8");
    assert.ok(
      src.includes("TebayaOnlyGate"),
      `${file} に TebayaOnlyGate が掛かっていません（よそのお店に手羽屋の中身が見えます）`,
    );
    assert.ok(
      /<TebayaOnlyGate[\s\S]*<\/TebayaOnlyGate>/.test(src),
      `${file} の TebayaOnlyGate が閉じていません（中身を包めていません）`,
    );
  }
});

test("門そのものは、手羽屋のときだけ中身をそのまま出す作りになっている", () => {
  const src = readFileSync("app/components/TebayaOnlyGate.tsx", "utf8");
  assert.ok(
    src.includes("isTebayaScope(scope)") && src.includes("{children}"),
    "TebayaOnlyGate が isTebayaScope で出し分けていません",
  );
  assert.ok(
    src.includes("readTenantScope()"),
    "TebayaOnlyGate が「いまどのお店か」を読んでいません",
  );
});

test("印の欄がまだ無い棚を、門の外の画面が新たに読み始めていない", () => {
  /**
   * 合言葉（管理者パスワード）の要らない画面から、この2つの棚を読む所が増えたら
   * そこにも門が要る。増えたことにその場で気づけるように、いまの一覧を固定しておく。
   * ★ /admin 配下と /api 配下は、合言葉かサーバー側の鍵の内側なので対象外。
   */
  const found: string[] = [];
  for (const file of sourceFiles("app")) {
    const rel = file.replace(/\\/g, "/");
    if (rel.startsWith("app/admin/") || rel.startsWith("app/api/")) continue;
    const src = readFileSync(file, "utf8");
    for (const table of TABLES_WITHOUT_TENANT_COLUMN) {
      if (!src.includes(`.from("${table}")`)) continue;
      // 門（ページ全体）か、枠だけ出さない道具（useIsTebaya）のどちらかが要る
      if (src.includes("TebayaOnlyGate") || src.includes("useIsTebaya")) continue;
      found.push(`${rel}（${table}）`);
    }
  }
  assert.deepEqual(
    found,
    [
      // 入り口を外している画面（2026-08-27）。トップにリンクが無いので開かれない
      "app/report/cancel/page.tsx（shifts）",
      // 出店予定の中身。包んでいるのは app/shifts/CombinedClient.tsx
      "app/shifts/ShiftsView.tsx（shifts）",
    ],
    `印の欄が無い棚を、門の掛かっていない画面が読んでいます：\n${found.join("\n")}`,
  );
});

test("月間の売上まとめ（トップと管理者ページ）は、よそのお店には出さない", () => {
  /**
   * この2つの枠は「出店予定の目標額」と「日報の売上」から作っている。
   * 出店予定に印の欄が無いので、よそのお店が開くと **手羽屋の数字** が出てしまう。
   * ★とくにトップ（/）は合言葉が要らないので、申し込んだお店のスタッフが
   *   開いた瞬間に手羽屋の今月の売上金額が見える（2026-09-24 実測して直した）。
   */
  for (const file of [
    "app/components/MonthlySummary.tsx",
    "app/components/MonthlyDashboard.tsx",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.ok(
      src.includes("useIsTebaya()"),
      `${file} が「いまどのお店か」を見ていません`,
    );
    assert.ok(
      /if\s*\(scopeChecking\s*\|\|\s*!isTebaya\)\s*return null;/.test(src),
      `${file} が、よそのお店のときに枠を出さない形になっていません`,
    );
    assert.ok(
      /if\s*\(scopeChecking\s*\|\|\s*!isTebaya\)\s*return;/.test(src),
      `${file} が、よそのお店のときに手羽屋の棚を読みに行かない形になっていません`,
    );
  }
});

test("よそのお店のときは、印の欄が無い棚を読みに行くこと自体をしない", () => {
  /**
   * 画面に出さないだけだと、中身はブラウザまで届いている。
   * 「出さない」と「取りに行かない」を両方そろえて初めて、
   *   入れたデータは他のお店から見えません（/keiri/help のお約束）
   * と言い切れる。
   */
  const src = readFileSync("app/keiri/advances/page.tsx", "utf8");
  assert.ok(
    /if\s*\(scopeChecking\s*\|\|\s*!isTebaya\)\s*return;/.test(src),
    "app/keiri/advances/page.tsx が、よそのお店のときに読み込みを止めていません",
  );
});

/* ---------- 合言葉の要らない「お金の画面」は、よそのお店には開かない ---------- */

/**
 * 経理パッケージを申し込んだお店のスタッフは、このアプリの画面をそのまま開ける
 * （合言葉が要るのは管理者ページだけ）。
 * ところが下の画面は、どれも**手羽屋の金額**を出す：
 *   現金残高・立替と精算・レジ突き合わせ・売上報告・中間報告・出店先ごとの売上分析。
 * 日報は印で絞ってあるが、現金の設定・立替・設営後チェック・中間報告・出店予定には
 * まだ印の欄が無く、絞りようが無い。
 *
 * /keiri/help のお約束は「入れたデータは他のお店から見えません。
 * 売上の金額を、他のお店の画面に出すことはありません」。
 * 欄ができるまでは、**画面ごと開かない**ことでその約束を守る。
 * 手羽屋は印が空なので、どの画面もこれまでどおり出る。
 */
const MONEY_SCREENS_FOR_TEBAYA_ONLY = [
  "app/analytics/page.tsx",
  "app/cash/page.tsx",
  "app/cash/advances/page.tsx",
  "app/cash/register/page.tsx",
  "app/sales-report/page.tsx",
  "app/interim/page.tsx",
  "app/shifts/CombinedClient.tsx",
  "app/keiri/advances/page.tsx",
];

test("合言葉の要らないお金の画面には、手羽屋だけに開く門が掛かっている", () => {
  const missing: string[] = [];
  for (const file of MONEY_SCREENS_FOR_TEBAYA_ONLY) {
    const src = readFileSync(file, "utf8");
    if (!/<TebayaOnlyGate[\s\S]*<\/TebayaOnlyGate>/.test(src)) missing.push(file);
  }
  assert.deepEqual(
    missing,
    [],
    `次の画面に門が掛かっていません（よそのお店に手羽屋の金額が見えます）：\n${missing.join("\n")}`,
  );
});

test("出店先ごとの売上は、よそのお店が呼んでも何も読まずに空で返す", () => {
  /**
   * ここは3か所（トップのランキング・出店先の分析・出店先問い合わせ）が呼ぶ出入口。
   * 1か所で止めれば、呼ぶ側が増えても漏れない。
   */
  const src = readFileSync("lib/analytics/outletAnalytics.ts", "utf8");
  assert.ok(
    /if\s*\(!isTebayaScope\(readTenantScope\(\)\)\)\s*return \[\];/.test(src),
    "getOutletAnalytics が、よそのお店のときに空で返す形になっていません",
  );
});
