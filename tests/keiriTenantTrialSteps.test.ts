/**
 * 2軒目を入れる手順の 手順4・5・6（f5-4・f3-4）のテスト。
 *
 * ここが狂うと、テストの店のための行が**手羽屋の画面に混ざる**か、
 * 逆に「通った」と言ってよくない状態を合格にしてしまう。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { TEST_SHOP } from "../lib/keiri/tenantTrial";
import { sheetShowsNumbers } from "../lib/keiri/tenantTrialNumbers";
import {
  TEST_LOCATION,
  TEST_PRODUCT,
  TEST_REPORT,
  TEST_STAFF,
  buildTestLocation,
  buildTestProduct,
  buildTestReport,
  buildTestStaff,
  rollbackNeeded,
  stepsAllDone,
  stepsSummary,
  testProductCount,
  testReportDate,
  testStaffMatchesReport,
  type StepsState,
} from "../lib/keiri/tenantTrialSteps";
import { computeSalesBreakdown, type SaleProduct } from "../lib/salesBreakdown";
import { rowsInScope } from "../lib/tenantScope";

const TENANT = "11111111-2222-4333-8444-555555555555";

test("入れる行には必ず『どの店か』の印が付く（手羽屋の印が空の行にならない）", () => {
  const loc = buildTestLocation(TENANT) as { tenant_id?: string | null; name?: string };
  const rep = buildTestReport(TENANT) as { tenant_id?: string | null; date?: string };
  assert.equal(loc.tenant_id, TENANT);
  assert.equal(rep.tenant_id, TENANT);
  assert.notEqual(loc.tenant_id, null);
  assert.notEqual(rep.tenant_id, null);
});

test("名前の頭に【テスト】が付く（本物と見分けが付く）", () => {
  const loc = buildTestLocation(TENANT) as { name: string };
  const rep = buildTestReport(TENANT) as { location: string; staff_name: string };
  assert.ok(loc.name.startsWith("【テスト】"));
  assert.ok(rep.location.startsWith("【テスト】"));
  assert.ok(rep.staff_name.startsWith("【テスト】"));
  assert.ok(TEST_SHOP.name.startsWith("【テスト】"));
});

test("手羽屋（印が空）で絞ると、入れた行は1行も出ない", () => {
  const tebayaRow = { tenant_id: null, name: "ながやま鷹尾" };
  const rows = [
    tebayaRow,
    buildTestLocation(TENANT) as unknown as { tenant_id: string | null; name: string },
  ];
  const visible = rowsInScope(rows as { tenant_id?: string | null }[], null);
  assert.equal(visible.length, 1);
  assert.equal((visible[0] as { name: string }).name, "ながやま鷹尾");
});

test("日報の日付は、テストの店の数え始めの日と同じ", () => {
  assert.equal(testReportDate(), TEST_SHOP.openingDate);
  const rep = buildTestReport(TENANT) as { date: string };
  assert.equal(rep.date, TEST_SHOP.openingDate);
});

test("日報の中身は架空の固定値で、売上と内訳が合っている", () => {
  const rep = buildTestReport(TENANT) as {
    sales_amount: number;
    breakdown_total: number;
    breakdown_diff: number;
    expenses: { amount: number; receipt_image_url: null | string }[];
  };
  assert.equal(rep.sales_amount, TEST_REPORT.sales);
  assert.equal(rep.breakdown_total, TEST_REPORT.sales);
  assert.equal(rep.breakdown_diff, 0);
  assert.equal(rep.expenses.length, 1);
  assert.equal(rep.expenses[0].amount, TEST_REPORT.expenseAmount);
  assert.equal(rep.expenses[0].receipt_image_url, null);
});

test("出店場所の場代の決まりは『なし』（0円の行を作らない・CLAUDE.md 4-15）", () => {
  const loc = buildTestLocation(TENANT) as { booth_fee_type: string };
  assert.equal(loc.booth_fee_type, "none");
  assert.equal(TEST_LOCATION.boothFeeType, "none");
});

const seen = { locations: 20, reports: 184, products: 7, staff: 8 };

test("手羽屋に見える件数が動いたら取り消す", () => {
  assert.equal(rollbackNeeded(seen, { ...seen }), false);
  assert.equal(rollbackNeeded(seen, { ...seen, locations: 21 }), true);
  assert.equal(rollbackNeeded(seen, { ...seen, reports: 185 }), true);
  // 商品も数える（手順4で1件 入れるようになったため・2026-10-30）
  assert.equal(rollbackNeeded(seen, { ...seen, products: 8 }), true);
  // 担当者も数える（手順4で1人 入れるようになったため・2026-10-31）
  assert.equal(rollbackNeeded(seen, { ...seen, staff: 9 }), true);
});

test("数えられなかったときも取り消す（0件と読めなかったを取り違えない）", () => {
  assert.equal(rollbackNeeded({ ...seen, locations: null }, { ...seen }), true);
  assert.equal(rollbackNeeded(seen, { ...seen, reports: null }), true);
  assert.equal(rollbackNeeded(seen, { ...seen, products: null }), true);
  assert.equal(rollbackNeeded(seen, { ...seen, staff: null }), true);
});

const done: StepsState = {
  shopReady: true,
  locationReady: true,
  productReady: true,
  staffReady: true,
  reportReady: true,
  separated: true,
  numbersShown: true,
};

test("手順4〜6がそろって初めて『通った』と言う", () => {
  assert.equal(stepsAllDone(done), true);
  assert.equal(stepsAllDone({ ...done, productReady: false }), false);
  assert.equal(stepsAllDone({ ...done, staffReady: false }), false);
  assert.equal(stepsAllDone({ ...done, separated: false }), false);
  assert.equal(stepsAllDone({ ...done, numbersShown: false }), false);
  assert.equal(stepsAllDone({ ...done, shopReady: false }), false);
});

test("まとめの1行は、のこりを名指しする", () => {
  assert.match(stepsSummary(done), /手順4・5・6 まで通りました/);
  assert.match(stepsSummary({ ...done, shopReady: false }), /テストの店がまだありません/);
  assert.match(stepsSummary({ ...done, locationReady: false }), /手順4（出店場所）/);
  assert.match(stepsSummary({ ...done, productReady: false }), /手順4（商品と単価）/);
  assert.match(stepsSummary({ ...done, staffReady: false }), /手順4（担当者と日当）/);
  assert.match(stepsSummary({ ...done, separated: false }), /手順6/);
  assert.match(stepsSummary(done, true), /取り消しました/);
});

/* ---------- 手順5で自分の日報を入れても「分かれている」が崩れないこと ---------- */

test("テストの店の日報が1枚 入っても、分かれている判定は崩れない（よその行だけを数える）", () => {
  const { separationOk } = require("../lib/keiri/tenantTrial") as typeof import("../lib/keiri/tenantTrial");
  const tebaya = { reportCount: 15, advancesRead: true, readable: true };
  // 手順5のあと：そのお店として1件 読めるが、それは自分の行（よその行は0）
  assert.equal(
    separationOk({ tebaya, testShop: { reportCount: 1, foreignCount: 0, advancesRead: false, readable: true } }),
    true,
  );
  // 手羽屋の行が1件でも混ざったら、分かれているとは言わない
  assert.equal(
    separationOk({ tebaya, testShop: { reportCount: 1, foreignCount: 1, advancesRead: false, readable: true } }),
    false,
  );
  // よその行の数が渡されないときは、これまでどおり件数で見る
  assert.equal(
    separationOk({ tebaya, testShop: { reportCount: 1, advancesRead: false, readable: true } }),
    false,
  );
});

// --- 「今月の利益・今の現金」が出たかは、数えてから言う（2026-10-28・f5-4） ---
//   通す側の窓口は 2026-10-28 まで「日報が1枚 入った＝数字も出た」と書いていました。
//   ここは、その判定（計算だけの部分）を固定します。
test("1枚の要約に『残ったお金』と現金があれば、数字が出たと言う", () => {
  assert.equal(
    sheetShowsNumbers({
      headline: [{ label: "今月 残ったお金", yen: 19000 }],
      cash: { balance: 19000 },
    }),
    true,
  );
});

test("『残ったお金』の行が無ければ、出たとは言わない", () => {
  assert.equal(
    sheetShowsNumbers({ headline: [{ label: "売上", yen: 30000 }], cash: { balance: 0 } }),
    false,
  );
});

test("金額が数でなければ、出たとは言わない", () => {
  assert.equal(
    sheetShowsNumbers({
      headline: [{ label: "今月 残ったお金", yen: Number.NaN }],
      cash: { balance: 19000 },
    }),
    false,
  );
  assert.equal(
    sheetShowsNumbers({
      headline: [{ label: "今月 残ったお金", yen: 19000 }],
      cash: { balance: Number.NaN },
    }),
    false,
  );
});


/* ---------- 手順4の商品（名前と単価）／2026-10-30・kp269 ---------- */

test("商品の行にも『どの店か』の印が付き、名前の頭に【テスト】が付く", () => {
  const p = buildTestProduct(TENANT) as {
    tenant_id?: string | null;
    name: string;
    shop: string;
    price: number;
    is_active: boolean;
  };
  assert.equal(p.tenant_id, TENANT);
  assert.ok(p.name.startsWith("【テスト】"));
  // 日報の画面は開いているお店の shop で商品を絞るので、手順5の日報と同じでないと出ない
  assert.equal(p.shop, TEST_REPORT.shop);
  assert.equal(p.price, TEST_PRODUCT.price);
  assert.equal(p.is_active, true);
});

test("商品の行は、手羽屋の画面に出ない（印が空の行として読まれない）", () => {
  const rows = [buildTestProduct(TENANT), { tenant_id: null, name: "手羽先" }];
  assert.equal(rowsInScope(rows, null).length, 1);
  assert.equal((rowsInScope(rows, null)[0] as { name: string }).name, "手羽先");
});

test("単価は、手順5の日報の売上とぴったり割り切れる（本数を出せる）", () => {
  const count = testProductCount();
  assert.equal(count, 60);
  assert.equal((count as number) * TEST_PRODUCT.price, TEST_REPORT.sales);
});

test("STEP4 の突き合わせ（単価 × 本数 = 売上）が、この固定値で成り立つ", () => {
  const products: SaleProduct[] = [
    {
      id: 1,
      shop: TEST_REPORT.shop,
      name: TEST_PRODUCT.name,
      price: TEST_PRODUCT.price,
      kind: TEST_PRODUCT.kind,
      is_active: true,
      sort_order: TEST_PRODUCT.sortOrder,
    },
  ];
  const b = computeSalesBreakdown({
    sales: TEST_REPORT.sales,
    products,
    counts: { [TEST_PRODUCT.name]: testProductCount() as number },
  });
  assert.equal(b.total, TEST_REPORT.sales);
  assert.equal(b.diff, 0);
  assert.equal(b.matched, true);
  assert.deepEqual(b.unpricedNames, []);
});


/* ---------- 手順4の担当者（名前と日当）／2026-10-31・kp270 ---------- */

test("担当者の行にも『どの店か』の印が付き、名前の頭に【テスト】が付く", () => {
  const st = buildTestStaff(TENANT) as {
    tenant_id?: string | null;
    name: string;
    daily_wage: number;
    is_active: boolean;
  };
  assert.equal(st.tenant_id, TENANT);
  assert.ok(st.name.startsWith("【テスト】"));
  assert.equal(st.daily_wage, TEST_STAFF.dailyWage);
  assert.equal(st.is_active, true);
  // 番隊・別名は入れない（手羽屋だけの決まりなので、よそのお店に作らない）
  assert.ok(!("unit_number" in st), "番隊を入れています");
  assert.ok(!("aliases" in st), "別名を入れています");
});

test("担当者の行は、手羽屋の画面に出ない（印が空の行として読まれない）", () => {
  const rows = [buildTestStaff(TENANT), { tenant_id: null, name: "イデ" }];
  assert.equal(rowsInScope(rows, null).length, 1);
  assert.equal((rowsInScope(rows, null)[0] as { name: string }).name, "イデ");
});

test("担当者の名前と日当が、手順5の日報とそろっている（利益が手打ちにならない）", () => {
  assert.equal(testStaffMatchesReport(), true);
  assert.equal(TEST_STAFF.name, TEST_REPORT.staffName);
  assert.equal(TEST_STAFF.dailyWage, TEST_REPORT.labor);
  const r = buildTestReport(TENANT) as { staff_name: string; labor: number };
  assert.equal(r.staff_name, TEST_STAFF.name);
  assert.equal(r.labor, TEST_STAFF.dailyWage);
});
