/**
 * 「粗利の目安（食材25%・場代10%）を出してよいお店か」の決まりのテスト
 * （2026-10-23・f3-4）。
 *
 * ここが狂うと、
 *   ・手羽屋の文と確認画面から粗利の目安が消える（毎日の現場が困る）
 *   ・よそのお店に、そのお店が決めていない率で粗利が出る
 * ので、両方を数字で固定する。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTUAL_ONLY_NOTE,
  showsEstimatedGrossProfit,
} from "../lib/grossProfitRule";
import { TEBAYA_SCOPE } from "../lib/tenantScope";
import { calcActualProfit, calcGrossProfit } from "../lib/money";
import { generateLineText } from "../lib/lineText";
import { initialForm } from "../lib/formState";

test("手羽屋（印が空）では目安を出す＝今までどおり", () => {
  assert.equal(showsEstimatedGrossProfit(TEBAYA_SCOPE), true);
  assert.equal(showsEstimatedGrossProfit(), true);
  // 空文字・空白だけの印も手羽屋として扱う（安全側）
  assert.equal(showsEstimatedGrossProfit(""), true);
  assert.equal(showsEstimatedGrossProfit("   "), true);
});

test("申し込んだお店では目安を出さない", () => {
  assert.equal(showsEstimatedGrossProfit("11111111-2222-3333-4444-555555555555"), false);
});

function formWith(sales: number, labor: number, expense: number) {
  const f: any = initialForm();
  f.date = "2026-10-23";
  f.staff_name = "テスト太郎";
  f.location = "テスト広場";
  f.sales_amount = sales;
  f.labor = labor;
  f.expenses = [{ description: "氷", amount: expense }];
  return f;
}

test("LINEの文：手羽屋は今までどおり25%・10%が出る", () => {
  const f = formWith(100000, 9000, 5000);
  const text = generateLineText(f, 100000, undefined, 9000);
  const g = calcGrossProfit(100000, 9000);
  assert.equal(g.food, 25000);
  assert.equal(g.rent, 10000);
  assert.ok(text.includes("原価概算（Food）：¥25,000（売上の25%）"));
  assert.ok(text.includes("場代(Rent)：¥10,000"));
  assert.ok(text.includes(`粗利：¥${g.profit.toLocaleString()}`));
  assert.ok(!text.includes(ACTUAL_ONLY_NOTE));
});

test("LINEの文：よそのお店には率を出さず、実際に出たお金だけで粗利を出す", () => {
  const f = formWith(100000, 9000, 5000);
  const text = generateLineText(f, 100000, undefined, 9000, "11111111-2222-3333-4444-555555555555");
  const a = calcActualProfit(100000, 9000, 5000);
  assert.equal(a.profit, 86000);
  assert.ok(text.includes(ACTUAL_ONLY_NOTE));
  assert.ok(!text.includes("原価概算"));
  assert.ok(!text.includes("場代(Rent)"));
  assert.ok(text.includes("粗利：¥86,000"));
});

test("LINEの文：お店を渡さなければ手羽屋のときと1文字も変わらない", () => {
  const f = formWith(80000, 10000, 3000);
  assert.equal(
    generateLineText(f, 80000, undefined, 10000),
    generateLineText(f, 80000, undefined, 10000, TEBAYA_SCOPE),
  );
});
