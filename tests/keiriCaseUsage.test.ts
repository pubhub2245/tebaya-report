/**
 * 紹介ページの「続いていること」（日報の枚数・続いている月数）のテスト。
 *
 * ここが狂うと、紹介ページに事実でない「実績」が出る。守るのは3つ：
 *  ①数える相手を間違えない（もも屋・よそのお店・集計から外した日・未来の日付を数えない）
 *  ②1枚も無ければ数字を作らず null（画面は区画ごと出さない）
 *  ③**金額の列を1つも取りに行かない**（同業の店主が開くページなので手の内を見せない）
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  summarizeUsage,
  monthLabel,
  dateLabel,
  monthSpan,
  toIsoDate,
} from "../lib/keiri/caseUsage";

const TODAY = new Date(2026, 8, 24); // 2026-09-24

test("日付と月の表し方", () => {
  assert.equal(toIsoDate(new Date(2026, 8, 4)), "2026-09-04");
  assert.equal(monthLabel("2026-04"), "2026年4月");
  assert.equal(dateLabel("2026-09-21"), "2026年9月21日");
  assert.equal(monthSpan("2026-04", "2026-09"), 6);
  assert.equal(monthSpan("2026-09", "2026-09"), 1);
  // 年をまたいでも正しく数える
  assert.equal(monthSpan("2025-11", "2026-02"), 4);
});

test("枚数・月数・いちばん新しい日報を数える（抜けが無ければ noGap）", () => {
  const u = summarizeUsage(
    [
      { date: "2026-07-03", shop: "手羽屋" },
      { date: "2026-08-10", shop: "手羽屋" },
      { date: "2026-08-11", shop: null }, // 空は手羽屋として数える（古い日報）
      { date: "2026-09-21", shop: "手羽屋" },
    ],
    TODAY,
  );
  assert.ok(u);
  assert.equal(u!.reports, 4);
  assert.equal(u!.months, 3);
  assert.equal(u!.firstMonth, "2026年7月");
  assert.equal(u!.lastMonth, "2026年9月");
  assert.equal(u!.noGap, true);
  assert.equal(u!.lastDate, "2026年9月21日");
  assert.equal(u!.checkedOn, "2026-09-24");
});

test("月が飛んでいたら noGap は false（『1か月も抜けずに』と書かせない）", () => {
  const u = summarizeUsage(
    [
      { date: "2026-04-01", shop: "手羽屋" },
      { date: "2026-09-01", shop: "手羽屋" },
    ],
    TODAY,
  );
  assert.equal(u!.months, 2);
  assert.equal(u!.noGap, false);
});

test("もも屋・集計から外した日・未来の日付・こわれた日付は数えない", () => {
  const u = summarizeUsage(
    [
      { date: "2026-08-01", shop: "手羽屋" },
      { date: "2026-08-02", shop: "もも屋" }, // 別の屋号
      { date: "2026-08-03", shop: "手羽屋", exclude_from_stats: true }, // 集計から外す日
      { date: "2026-12-31", shop: "手羽屋" }, // 未来の日付（打ち間違い）
      { date: "", shop: "手羽屋" },
      { date: null, shop: "手羽屋" },
      { shop: "手羽屋" },
    ],
    TODAY,
  );
  assert.equal(u!.reports, 1);
  assert.equal(u!.months, 1);
  assert.equal(u!.lastDate, "2026年8月1日");
});

test("数えられる日報が1枚も無ければ null（0枚と書かない・数字を作らない）", () => {
  assert.equal(summarizeUsage([], TODAY), null);
  assert.equal(summarizeUsage([{ date: "2026-08-01", shop: "もも屋" }], TODAY), null);
});

test("★倉庫から金額の列を1つも取りに行かない", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/keiri/caseUsage.ts"), "utf8");
  const select = src.match(/\.select\("([^"]*)"\)/);
  assert.ok(select, "select が見つからない");
  const cols = select![1].split(",").map((c) => c.trim()).sort();
  // 取ってよいのはこの3つだけ。1つでも増えたら落とす
  assert.deepEqual(cols, ["date", "exclude_from_stats", "shop"]);
  for (const ng of ["sales_amount", "labor", "expenses", "profit", "booth_fee", "register_total"]) {
    assert.ok(!src.includes(ng), `金額の列 ${ng} を読んではいけない`);
  }
});

test("★手羽屋のぶんだけを読む（よそのお店の日報を混ぜない）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/keiri/caseUsage.ts"), "utf8");
  assert.ok(src.includes('.is("tenant_id", null)'), "印が空（手羽屋）のぶんだけに絞ること");
});

test("★紹介ページは、読めなかったときに区画ごと出さない", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app/keiri/case/page.tsx"), "utf8");
  assert.ok(src.includes("getCaseUsage"), "紹介ページが実測値を読んでいない");
  assert.ok(src.includes("{usage && ("), "null のときに区画ごと消す形になっていない");
  // 枚数・月数・いちばん新しい日報の3つが出ていること
  assert.ok(src.includes("{usage.reports}"));
  assert.ok(src.includes("{usage.months}"));
  assert.ok(src.includes("{usage.lastDate}"));
  // この区画に金額（万円・円）を直書きしないこと
  const block = src.split("{/* ---------- 続いていること")[1].split("{/* ---------- 何が出るか")[0];
  assert.ok(!block.includes("manYen"), "この区画に金額を出してはいけない");
  assert.ok(!/[0-9]円/.test(block), "この区画に金額を直書きしてはいけない");
});
