import { strict as assert } from "node:assert";
import { test } from "node:test";

import { findDuplicateReports } from "@/lib/keiri/duplicates";
import type { KeiriReport } from "@/lib/keiri/types";

function rep(over: Partial<KeiriReport> & { date: string }): KeiriReport {
  return {
    id: over.id ?? null,
    date: over.date,
    location: over.location ?? "ながやま三股",
    staff_name: over.staff_name ?? "イデ",
    shop: over.shop ?? "手羽屋",
    sales_amount: over.sales_amount ?? 21_400,
    labor: over.labor ?? 0,
    expenses: over.expenses ?? [{ description: "氷", amount: 500 }],
  } as KeiriReport;
}

test("同じ中身の日報が2行あれば、疑いとして出す（余分な分の額も出す）", () => {
  const got = findDuplicateReports({
    ym: "2026-10",
    reports: [rep({ date: "2026-10-11", id: 1 }), rep({ date: "2026-10-11", id: 2 })],
  });
  assert.equal(got.groups.length, 1);
  assert.equal(got.groups[0].count, 2);
  assert.equal(got.extraReports, 1);
  assert.equal(got.extraSalesTotal, 21_400);
  assert.equal(got.extraExpenseTotal, 500);
  assert.deepEqual(got.groups[0].ids, [1, 2]);
});

test("3行あれば、余分は2行ぶん", () => {
  const got = findDuplicateReports({
    ym: "2026-10",
    reports: [
      rep({ date: "2026-10-11", id: 1 }),
      rep({ date: "2026-10-11", id: 2 }),
      rep({ date: "2026-10-11", id: 3 }),
    ],
  });
  assert.equal(got.extraReports, 2);
  assert.equal(got.extraSalesTotal, 42_800);
});

test("金額が1円でも違えば、別の日報として数える（決めつけない）", () => {
  const got = findDuplicateReports({
    ym: "2026-10",
    reports: [
      rep({ date: "2026-10-11", sales_amount: 21_400 }),
      rep({ date: "2026-10-11", sales_amount: 21_401 }),
    ],
  });
  assert.equal(got.groups.length, 0);
});

test("出店先・担当・お店の区分が違えば、同じ日でも疑いにしない", () => {
  const base = { date: "2026-10-11" } as const;
  for (const other of [
    rep({ ...base, location: "PASIO高城" }),
    rep({ ...base, staff_name: "じゅん" }),
    rep({ ...base, shop: "もも屋" }),
  ]) {
    const got = findDuplicateReports({ ym: "2026-10", reports: [rep(base), other] });
    assert.equal(got.groups.length, 0);
  }
});

test("経費の明細が違えば疑いにしない（並び順だけの違いは同じとみなす）", () => {
  const a = rep({
    date: "2026-10-11",
    expenses: [
      { description: "氷", amount: 500 },
      { description: "油", amount: 1_200 },
    ],
  });
  const b = rep({
    date: "2026-10-11",
    expenses: [
      { description: "油", amount: 1_200 },
      { description: "氷", amount: 500 },
    ],
  });
  const same = findDuplicateReports({ ym: "2026-10", reports: [a, b] });
  assert.equal(same.groups.length, 1, "並び順だけの違いは同じ中身");

  const c = rep({ date: "2026-10-11", expenses: [{ description: "氷", amount: 500 }] });
  const diff = findDuplicateReports({ ym: "2026-10", reports: [a, c] });
  assert.equal(diff.groups.length, 0);
});

test("見ている月の外の行は数えない", () => {
  const got = findDuplicateReports({
    ym: "2026-10",
    reports: [rep({ date: "2026-09-11" }), rep({ date: "2026-09-11" })],
  });
  assert.equal(got.groups.length, 0);
});

test("売上も経費も人件費も0の行は、二重でも数えない（締めの数字が動かないため）", () => {
  const empty = rep({ date: "2026-10-11", sales_amount: 0, labor: 0, expenses: [] });
  const got = findDuplicateReports({ ym: "2026-10", reports: [empty, empty] });
  assert.equal(got.groups.length, 0);
});

test("1件も無い月では、何も出さない", () => {
  const got = findDuplicateReports({ ym: "2026-10", reports: [] });
  assert.deepEqual(got.groups, []);
  assert.equal(got.extraReports, 0);
  assert.equal(got.extraSalesTotal, 0);
});

test("10月の実データの形（10/11・10/12 が2行ずつ）を、2組として出す", () => {
  const got = findDuplicateReports({
    ym: "2026-10",
    reports: [
      rep({ date: "2026-10-11", sales_amount: 21_400, expenses: [{ description: "氷", amount: 4_000 }] }),
      rep({ date: "2026-10-11", sales_amount: 21_400, expenses: [{ description: "氷", amount: 4_000 }] }),
      rep({ date: "2026-10-12", sales_amount: 23_650, expenses: [{ description: "炭", amount: 6_317 }] }),
      rep({ date: "2026-10-12", sales_amount: 23_650, expenses: [{ description: "炭", amount: 6_317 }] }),
      rep({ date: "2026-10-13", sales_amount: 30_000 }),
    ],
  });
  assert.equal(got.groups.length, 2);
  assert.equal(got.extraReports, 2);
  assert.equal(got.extraSalesTotal, 45_050);
  assert.equal(got.extraExpenseTotal, 10_317);
  assert.deepEqual(
    got.groups.map((g) => g.date),
    ["2026-10-11", "2026-10-12"],
  );
});

/* ---- 1枚の要約にも出ること（lib/keiri/oneSheet.ts 経由・2026-11-03） ---- */

import { buildOneSheet } from "@/lib/keiri/oneSheet";
import { defaultSettingsFor, templateFor } from "@/lib/keiri/index";

test("1枚の要約の「確かめてほしいこと」に、同じ日報が2回の疑いが出る", () => {
  const same = (date: string) =>
    rep({ date, sales_amount: 21_400, expenses: [{ description: "氷", amount: 4_000 }] });
  const sheet = buildOneSheet({
    ym: "2026-10",
    monthLabel: "2026年10月",
    shopName: "手羽屋",
    reports: [same("2026-10-11"), same("2026-10-11"), rep({ date: "2026-10-13" })],
    payments: [],
    advances: [],
    settings: { ...defaultSettingsFor("tebaya"), opening_date: "2026-10-01" },
    template: templateFor("tebaya"),
    madeOn: "2026-11-03",
  });
  assert.equal(sheet.review.sameReport?.count, 1);
  assert.equal(sheet.review.sameReport?.extraReports, 1);
  assert.equal(sheet.review.sameReport?.extraSalesYen, 21_400);
  assert.equal(sheet.review.any, true);
});

test("二重が無い月では、1枚に「同じ日報が2回」を出さない", () => {
  const sheet = buildOneSheet({
    ym: "2026-10",
    monthLabel: "2026年10月",
    shopName: "手羽屋",
    reports: [rep({ date: "2026-10-11" }), rep({ date: "2026-10-13", sales_amount: 30_000 })],
    payments: [],
    advances: [],
    settings: { ...defaultSettingsFor("tebaya"), opening_date: "2026-10-01" },
    template: templateFor("tebaya"),
    madeOn: "2026-11-03",
  });
  assert.equal(sheet.review.sameReport, null);
});
