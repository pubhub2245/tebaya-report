/**
 * 出店希望メールパーサーのテスト。
 *
 * 実行: npx tsx --test lib/email-parser/__tests__/request-parser.test.ts
 *
 * Node.js 標準の test runner（node:test）を tsx 経由で実行する。
 * 追加ランタイム依存なし（jest/vitest 不要）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRequestEmail } from "../request-parser";

const FIXTURE_DIR = resolve(__dirname, "fixtures");
function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), "utf8");
}

// ---------------------------------------------------------------------------
// Test 1: 5月単月の正常系
// ---------------------------------------------------------------------------
test("正常系: 5月単月のメール", () => {
  const body = loadFixture("fixture-may-only.txt");
  const result = parseRequestEmail(body, { defaultYear: 2026 });

  assert.equal(result.months.length, 1, "1ヶ月分");
  const m = result.months[0];
  assert.equal(m.year, 2026);
  assert.equal(m.month, 5);
  assert.equal(m.requests.length, 5, "5店舗");

  const shibida = m.requests.find((r) => r.store === "志比田店");
  assert.ok(shibida);
  assert.deepEqual(shibida.dates, [
    "2026-05-01",
    "2026-05-03",
    "2026-05-04",
    "2026-05-20",
    "2026-05-30",
  ]);

  const wakaba = m.requests.find((r) => r.store === "若葉店");
  assert.ok(wakaba);
  assert.equal(wakaba.dates.length, 6);

  const mimata = m.requests.find((r) => r.store === "三股店");
  assert.ok(mimata);
  assert.equal(mimata.dates.length, 8);

  // 表記揺れがないので「正規化」warningは出ない
  const normalizationWarn = result.warnings.filter((w) =>
    w.includes("正規化"),
  );
  assert.equal(normalizationWarn.length, 0);
});

// ---------------------------------------------------------------------------
// Test 2: 5月＋6月の複数月メール
// ---------------------------------------------------------------------------
test("正常系: 複数月（5月+6月）のメール", () => {
  const body = loadFixture("fixture-multi-month.txt");
  const result = parseRequestEmail(body, { defaultYear: 2026 });

  assert.equal(result.months.length, 2);
  const may = result.months.find((m) => m.month === 5);
  const jun = result.months.find((m) => m.month === 6);
  assert.ok(may);
  assert.ok(jun);

  const mayShibida = may.requests.find((r) => r.store === "志比田店");
  assert.deepEqual(mayShibida?.dates, ["2026-05-01", "2026-05-03"]);
  const junShibida = jun.requests.find((r) => r.store === "志比田店");
  assert.deepEqual(junShibida?.dates, ["2026-06-01", "2026-06-02"]);
});

// ---------------------------------------------------------------------------
// Test 3: 「追加出店希望日」のみのメール
// ---------------------------------------------------------------------------
test("正常系: 追加出店希望日のみのメール", () => {
  const body = loadFixture("fixture-additional-only.txt");
  const result = parseRequestEmail(body, { defaultYear: 2026 });

  assert.equal(result.months.length, 1);
  const m = result.months[0];
  assert.equal(m.year, 2026);
  assert.equal(m.month, 5);
  assert.equal(m.requests.length, 2);

  const mimata = m.requests.find((r) => r.store === "三股店");
  assert.deepEqual(mimata?.dates, ["2026-05-26", "2026-05-28"]);
  const shibida = m.requests.find((r) => r.store === "志比田店");
  assert.deepEqual(shibida?.dates, ["2026-05-27"]);
});

// ---------------------------------------------------------------------------
// Test 4: 表記揺れ正規化
// ---------------------------------------------------------------------------
test("異常系: 表記揺れ（わかば店/高尾店/三又店）が正規化される", () => {
  const body = loadFixture("fixture-typos.txt");
  const result = parseRequestEmail(body, { defaultYear: 2026 });

  assert.equal(result.months.length, 1);
  const m = result.months[0];
  assert.equal(m.month, 4);

  const wakaba = m.requests.find((r) => r.store === "若葉店");
  assert.deepEqual(wakaba?.dates, ["2026-04-01"]);
  const takao = m.requests.find((r) => r.store === "鷹尾店");
  assert.deepEqual(takao?.dates, ["2026-04-02"]);
  const mimata = m.requests.find((r) => r.store === "三股店");
  assert.deepEqual(mimata?.dates, ["2026-04-03"]);

  // 3件の正規化warning
  const normWarns = result.warnings.filter((w) => w.includes("正規化"));
  assert.equal(normWarns.length, 3);
  assert.ok(normWarns.some((w) => w.includes("わかば店") && w.includes("若葉店")));
  assert.ok(normWarns.some((w) => w.includes("高尾店") && w.includes("鷹尾店")));
  assert.ok(normWarns.some((w) => w.includes("三又店") && w.includes("三股店")));
});

// ---------------------------------------------------------------------------
// Test 5: 全角数字・全角スラッシュの半角変換
// ---------------------------------------------------------------------------
test("異常系: 全角数字・全角スラッシュが半角に変換される", () => {
  const body = loadFixture("fixture-fullwidth.txt");
  const result = parseRequestEmail(body, { defaultYear: 2026 });

  assert.equal(result.months.length, 1);
  const m = result.months[0];
  assert.equal(m.month, 5);

  const shibida = m.requests.find((r) => r.store === "志比田店");
  assert.deepEqual(shibida?.dates, ["2026-05-01", "2026-05-03", "2026-05-20"]);
  const wakaba = m.requests.find((r) => r.store === "若葉店");
  assert.deepEqual(wakaba?.dates, ["2026-05-05", "2026-05-10"]);
});

// ---------------------------------------------------------------------------
// Test 6: 無効日付（4/31, 4/32）の警告と除外
// ---------------------------------------------------------------------------
test("異常系: 4/31 のような無効日付は warnings に入って除外", () => {
  const body = loadFixture("fixture-invalid-date.txt");
  const result = parseRequestEmail(body, { defaultYear: 2026 });

  assert.equal(result.months.length, 1);
  const m = result.months[0];
  assert.equal(m.month, 4);

  const shibida = m.requests.find((r) => r.store === "志比田店");
  // 4/31 は除外され 4/1, 4/15 のみ
  assert.deepEqual(shibida?.dates, ["2026-04-01", "2026-04-15"]);

  const wakaba = m.requests.find((r) => r.store === "若葉店");
  // 4/30 は有効、4/32 は除外
  assert.deepEqual(wakaba?.dates, ["2026-04-30"]);

  const invalidWarns = result.warnings.filter((w) => w.includes("無効な日付"));
  assert.equal(invalidWarns.length, 2);
  assert.ok(invalidWarns.some((w) => w.includes("4/31")));
  assert.ok(invalidWarns.some((w) => w.includes("4/32")));
});

// ---------------------------------------------------------------------------
// Test 7: 未知の店舗名（宮崎店）が警告で除外される
// ---------------------------------------------------------------------------
test("異常系: 未知の店舗名（宮崎店）が warnings に入って除外", () => {
  const body = loadFixture("fixture-unknown-store.txt");
  const result = parseRequestEmail(body, { defaultYear: 2026 });

  assert.equal(result.months.length, 1);
  const m = result.months[0];
  assert.equal(m.requests.length, 2); // 志比田・若葉のみ
  assert.ok(m.requests.find((r) => r.store === "志比田店"));
  assert.ok(m.requests.find((r) => r.store === "若葉店"));
  assert.ok(!m.requests.find((r) => (r.store as string) === "宮崎店"));

  const unknownWarns = result.warnings.filter((w) =>
    w.includes("未知の店舗名"),
  );
  assert.equal(unknownWarns.length, 1);
  assert.ok(unknownWarns[0].includes("宮崎店"));
});

// ---------------------------------------------------------------------------
// Test 8: 空文字列入力で空配列が返る
// ---------------------------------------------------------------------------
test("エッジケース: 空文字列入力で空配列が返る", () => {
  const result = parseRequestEmail("", { defaultYear: 2026 });
  assert.deepEqual(result.months, []);
  assert.deepEqual(result.warnings, []);
});

test("エッジケース: 空白のみの入力でも空配列", () => {
  const result = parseRequestEmail("   \n\n  \t  \n", { defaultYear: 2026 });
  assert.deepEqual(result.months, []);
});

// ---------------------------------------------------------------------------
// Test 9: ヘッダーが見つからない本文 → 空配列＋warning
// ---------------------------------------------------------------------------
test("エッジケース: ヘッダーのない本文で空配列＋warning", () => {
  const body = loadFixture("fixture-no-header.txt");
  const result = parseRequestEmail(body, { defaultYear: 2026 });

  assert.deepEqual(result.months, []);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes("ヘッダー"));
});

// ---------------------------------------------------------------------------
// 追加: 年推定ロジック
// ---------------------------------------------------------------------------
test("年推定: defaultYear 指定があればそれを使う", () => {
  const body = "【4月 出店希望日】\n・志比田店　4/1";
  const result = parseRequestEmail(body, { defaultYear: 2030 });
  assert.equal(result.months[0].year, 2030);
});

test("年推定: defaultYear 未指定で当月以降のヘッダーは現在年", () => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const body = `【${currentMonth}月 出店希望日】\n・志比田店　${currentMonth}/1`;
  const result = parseRequestEmail(body);
  assert.equal(result.months[0].year, currentYear);
});

test("年推定: defaultYear 未指定でヘッダー月が現在月より前なら翌年", () => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  // 現在月が 1月（=1）の場合は前月が無いのでこのテストはスキップ
  if (currentMonth === 1) return;
  const prevMonth = currentMonth - 1;
  const body = `【${prevMonth}月 出店希望日】\n・志比田店　${prevMonth}/1`;
  const result = parseRequestEmail(body);
  assert.equal(result.months[0].year, currentYear + 1);
});
