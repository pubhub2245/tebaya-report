/**
 * 「同じ支払いが2か所にある」ときに、どちらを数えるかを決めて残す仕組みのテスト（kp230・f1-5）。
 *
 * ここが狂うと、月の経費が黙って増えたり減ったりする。
 * ★印が1つも無いときは、今までとまったく同じ数字になることを必ず固定する。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BOTH_COUNT_REASON,
  IGNORE_REASON,
  canChoose,
  ignoreKey,
  ignoreShelfStateOf,
  listIgnoredExpenses,
  pendingSuspects,
  readIgnoreMarks,
  suspectDecision,
  writesForChoice,
} from "../lib/keiri/expenseIgnores";
import { summarizeMonth } from "../lib/keiri/aggregate";
import { findDuplicateExpenses } from "../lib/keiri/duplicates";
import { buildOneSheet } from "../lib/keiri/oneSheet";
import { buildDupCheck } from "../lib/keiri/dupCheckScenario";
import { templateFor } from "../lib/keiri/index";
import type { KeiriAdvance, KeiriReport, KeiriSettings } from "../lib/keiri/types";

const settings: KeiriSettings = {
  opening_date: "2026-09-01",
  opening_balance: 0,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "2030-01",
};
const template = templateFor("generic");

/** 日報1件（9/12 に 18,000円の仕入れ 1行）と、同じ支払いの立替1件 */
function fixture(): { reports: KeiriReport[]; advances: KeiriAdvance[] } {
  return {
    reports: [
      {
        id: 101,
        date: "2026-09-12",
        sales_amount: 50000,
        labor: 0,
        expenses: [{ description: "肉 仕入れ", amount: 18000 }],
      },
    ],
    advances: [
      {
        id: 55,
        date: "2026-09-12",
        amount: 18000,
        description: "肉 仕入れ",
        payer: "じゅん",
        source: "owner",
      },
    ],
  };
}

test("印が1つも無ければ、今までとまったく同じ数字（両方数える＝経費が多く出る）", () => {
  const { reports, advances } = fixture();
  const before = summarizeMonth({ ym: "2026-09", reports, template, settings, advances });
  const after = summarizeMonth({
    ym: "2026-09",
    reports,
    template,
    settings,
    advances,
    ignoreMarks: readIgnoreMarks([]),
  });
  assert.equal(before.expenseTotal, 36000);
  assert.equal(after.expenseTotal, before.expenseTotal);
  assert.equal(after.profit, before.profit);
  assert.equal(after.ignoredTotal, 0);
  assert.deepEqual(after.ignored, []);
});

test("「日報のほうだけ数える」で、立て替えの分が経費から外れる（金額は1円も作らない）", () => {
  const { reports, advances } = fixture();
  const dup = findDuplicateExpenses({ ym: "2026-09", reports, advances });
  assert.equal(dup.suspects.length, 1);
  const rows = writesForChoice(dup.suspects[0], "count-report");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "advance_owner");
  assert.equal(rows[0].ref_id, "55");
  assert.equal(rows[0].line_index, null);
  assert.equal(rows[0].reason, IGNORE_REASON);
  assert.equal(rows[0].undone_at, null);

  const marks = readIgnoreMarks(rows);
  const after = summarizeMonth({
    ym: "2026-09",
    reports,
    template,
    settings,
    advances,
    ignoreMarks: marks,
  });
  assert.equal(after.expenseTotal, 18000);
  assert.equal(after.expenseFromAdvance, 0);
  assert.equal(after.ignoredTotal, 18000);
  assert.equal(after.ignored.length, 1);
  assert.equal(after.ignored[0].source, "advance_owner");
  assert.equal(after.profit, 50000 - 18000);
});

test("「立て替えのほうだけ数える」で、日報の行が経費から外れる", () => {
  const { reports, advances } = fixture();
  const dup = findDuplicateExpenses({ ym: "2026-09", reports, advances });
  const rows = writesForChoice(dup.suspects[0], "count-advance");
  assert.equal(rows[0].source, "report");
  assert.equal(rows[0].ref_id, "101");
  assert.equal(rows[0].line_index, 0);

  const after = summarizeMonth({
    ym: "2026-09",
    reports,
    template,
    settings,
    advances,
    ignoreMarks: readIgnoreMarks(rows),
  });
  assert.equal(after.expenseTotal, 18000);
  assert.equal(after.expenseFromRegister, 0);
  assert.equal(after.ignored[0].source, "report");
});

test("「別々の支払いなので両方数える」は、金額を1円も動かさず、疑いから外れるだけ", () => {
  const { reports, advances } = fixture();
  const dup = findDuplicateExpenses({ ym: "2026-09", reports, advances });
  const rows = writesForChoice(dup.suspects[0], "both", new Date("2026-10-09T09:00:00.000Z"));
  assert.equal(rows[0].reason, BOTH_COUNT_REASON);
  assert.equal(rows[0].undone_at, "2026-10-09T09:00:00.000Z");

  const marks = readIgnoreMarks(rows);
  const after = summarizeMonth({
    ym: "2026-09",
    reports,
    template,
    settings,
    advances,
    ignoreMarks: marks,
  });
  assert.equal(after.expenseTotal, 36000);
  assert.equal(after.ignoredTotal, 0);
  assert.equal(suspectDecision(dup.suspects[0], marks), "both");
  assert.equal(pendingSuspects(dup.suspects, marks).suspects.length, 0);
});

test("元に戻した印（戻した日時が入っている）は効かない＝また「決めていない」に戻る", () => {
  const { reports, advances } = fixture();
  const dup = findDuplicateExpenses({ ym: "2026-09", reports, advances });
  const rows = writesForChoice(dup.suspects[0], "count-report").map((r) => ({
    ...r,
    undone_at: "2026-10-09T10:00:00.000Z",
  }));
  const marks = readIgnoreMarks(rows);
  assert.equal(marks.ignored.size, 0);
  assert.equal(suspectDecision(dup.suspects[0], marks), "pending");
  const after = summarizeMonth({
    ym: "2026-09",
    reports,
    template,
    settings,
    advances,
    ignoreMarks: marks,
  });
  assert.equal(after.expenseTotal, 36000);
});

test("「数えない」が効いている印のほうが、「両方数える」より強い", () => {
  const marks = readIgnoreMarks([
    { source: "report", ref_id: "101", line_index: 0, reason: BOTH_COUNT_REASON, undone_at: "2026-10-09T09:00:00.000Z" },
    { source: "report", ref_id: "101", line_index: 0, reason: IGNORE_REASON, undone_at: null },
  ]);
  const key = ignoreKey("report", 101, 0);
  assert.ok(marks.ignored.has(key));
  assert.ok(!marks.bothCounted.has(key));
});

test("元の行の番号が読めない組は、印を付けられない（勝手に当てない）", () => {
  const reports: KeiriReport[] = [
    {
      date: "2026-09-12",
      sales_amount: 0,
      labor: 0,
      expenses: [{ description: "肉 仕入れ", amount: 18000 }],
    },
  ];
  const advances: KeiriAdvance[] = [
    { date: "2026-09-12", amount: 18000, description: "肉 仕入れ", source: "field" },
  ];
  const dup = findDuplicateExpenses({ ym: "2026-09", reports, advances });
  assert.equal(dup.suspects.length, 1);
  assert.equal(canChoose(dup.suspects[0]), false);
  assert.deepEqual(writesForChoice(dup.suspects[0], "count-report"), []);
});

test("棚がまだ無いときは missing、分からないときは unknown（勝手に ready にしない）", () => {
  assert.equal(ignoreShelfStateOf({ error: null }), "ready");
  assert.equal(ignoreShelfStateOf({ error: { code: "42P01", message: "" } }), "missing");
  assert.equal(
    ignoreShelfStateOf({ error: { code: "", message: "Could not find the table 'public.keiri_expense_ignores' in the schema cache" } }),
    "missing",
  );
  assert.equal(ignoreShelfStateOf({ error: { code: "42501", message: "permission denied" } }), "unknown");
  assert.equal(ignoreShelfStateOf(null), "unknown");
});

test("数えなかった行は、日付の順に並べて必ず持ち歩く（黙って減らさない）", () => {
  const { reports, advances } = fixture();
  const marks = readIgnoreMarks([
    { source: "report", ref_id: "101", line_index: 0, reason: IGNORE_REASON, undone_at: null },
  ]);
  const list = listIgnoredExpenses({ ym: "2026-09", reports, advances, marks });
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, 18000);
  assert.equal(list[0].description, "肉 仕入れ");
});


/**
 * f1-2 の決まり（月の経費は1つ・画面／会計ソフト向けCSV／1枚の3か所が同じ数字）が、
 * 印を付けたあとでも守られているか。
 * ★ここが崩れると、1枚は「検算が合わない」として出なくなる（出さないのは正しいが、
 *   それでは片付けた意味が無い）。
 */
test("印を付けても、画面・CSV・1枚の3通りの数え方が1円まで一致する", () => {
  const { reports, advances } = fixture();
  const dup = findDuplicateExpenses({ ym: "2026-09", reports, advances });
  const rows = writesForChoice(dup.suspects[0], "count-report");
  const marks = readIgnoreMarks(rows);

  const sheet = buildOneSheet({
    ym: "2026-09",
    monthLabel: "2026年9月",
    shopName: "テスト食堂",
    reports,
    payments: [],
    advances,
    settings,
    template,
    ignoreMarks: marks,
  });

  assert.equal(sheet.expenseCheck.same, true, sheet.verify.problems.join("／"));
  assert.equal(sheet.expenseCheck.screen, 18000);
  assert.equal(sheet.expenseCheck.csv, 18000);
  assert.equal(sheet.expenseCheck.byAccount, 18000);
  assert.equal(sheet.verify.ok, true, sheet.verify.problems.join("／"));
  // 片付いたので「確かめてほしいこと」から疑いが消える
  assert.equal(sheet.review.duplicate, null);
});

test("印が無いときの1枚は、今までとまったく同じ（疑いは出したまま）", () => {
  const { reports, advances } = fixture();
  const common = {
    ym: "2026-09",
    monthLabel: "2026年9月",
    shopName: "テスト食堂",
    reports,
    payments: [],
    advances,
    settings,
    template,
  };
  const before = buildOneSheet(common);
  const after = buildOneSheet({ ...common, ignoreMarks: readIgnoreMarks([]) });
  assert.equal(before.expenseCheck.screen, after.expenseCheck.screen);
  assert.equal(before.profitYen, after.profitYen);
  assert.equal(before.review.duplicate?.count, 1);
  assert.equal(after.review.duplicate?.count, 1);
});

/**
 * 外から確かめる窓口（/api/keiri/dupcheck）の中身。
 * ★ここが ok にならないと、検査役は「片付けられる」ことを外から確かめられない。
 */
test("架空のお店の4通りが、そのまま確かめられる形で出る（/api/keiri/dupcheck の中身）", () => {
  const check = buildDupCheck();
  assert.equal(check.suspectFound, true);
  assert.equal(check.ok, true, check.problems.join("／"));
  assert.equal(check.cases.length, 4);
  const [none, byReport, byAdvance, both] = check.cases;
  assert.equal(none.expenseYen, 36000);
  assert.equal(none.suspectsLeft, 1);
  assert.equal(byReport.expenseYen, 18000);
  assert.equal(byReport.notCountedYen, 18000);
  assert.equal(byReport.profitYen, 32000);
  assert.equal(byAdvance.expenseYen, 18000);
  assert.equal(both.expenseYen, 36000);
  assert.equal(both.notCountedYen, 0);
  for (const c of check.cases) {
    assert.equal(c.threeWaysAgree, true, c.choice);
    assert.equal(c.sheetReady, true, c.choice);
  }
  // 架空のお店の名前だけを出す（出る数字に手羽屋の実データは入らない）
  assert.equal(check.shop, "サンプル食堂");
  assert.ok(!JSON.stringify(check.cases).includes("手羽屋"));
});
