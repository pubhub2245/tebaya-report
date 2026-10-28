/**
 * テストの店（2軒目を入れる手順の確かめ用・架空の1軒）について、
 * **「今月の利益・今の現金」が本当に出るか**を1か所で数える（f5-4）。
 *
 * ■ なぜ別の場所に出したか（2026-10-28）
 *   手順4・5・6 を「通す側」（POST /api/keiri/tenant-trial/steps/run）は、
 *   日報の行が1枚 入っただけで **『数字も出た』と言っていました**
 *   （`numbersShown: reportReady`）。数えてもいないのに言っているので、
 *   「手順4・5・6 まで通りました」が嘘になりうる形でした。
 *   読むだけの窓口（GET）は ちゃんと数えていたので、**その数え方をここに移して
 *   両方から同じものを使います**。
 *
 * ■ ここは「出るか／出ないか」だけを返します
 *   金額は1円も返しません（窓口の約束と同じ）。
 */

import { templateFor } from "@/lib/keiri/index";
import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { buildOneSheet } from "@/lib/keiri/oneSheet";
import { TEST_SHOP } from "@/lib/keiri/tenantTrial";
import { testReportDate } from "@/lib/keiri/tenantTrialSteps";
import { businessCodeForScope } from "@/lib/tenantScope";

/** 1枚の要約から「利益と現金が数で出たか」を見る（計算だけ・テストで固定できる形） */
export function sheetShowsNumbers(sheet: {
  headline: { label: string; yen: number }[];
  cash: { balance: number };
}): boolean {
  const profit = sheet.headline.find((h) => h.label.includes("残ったお金"));
  if (!profit) return false;
  return Number.isFinite(profit.yen) && Number.isFinite(sheet.cash.balance);
}

/**
 * テストの店の、その月の「今月の利益・今の現金」が出るか。
 *
 * ★読めなかった・出なかったときは **false**（「出た」とは言わない）。
 */
export async function testShopNumbersShown(tenantId: string): Promise<boolean> {
  try {
    const ym = testReportDate().slice(0, 7);
    const [y, m] = ym.split("-");
    const businessCode = businessCodeForScope(tenantId);
    // ★貼り紙⑧⑪⑫のあと、テストの店の行は公開の鍵では読めない（0件で返る）。
    //   倉庫の窓口ごしに読むためのテストの印を渡す（GET の窓口と字句までそろえる）。
    const data = await loadKeiriMonthServer({
      ym,
      businessCode,
      scope: tenantId,
      monthOnly: true,
      tenantReadTestMark: TEST_SHOP.mark,
    });
    if (data.reports.length === 0) return false;
    const sheet = buildOneSheet({
      ym,
      monthLabel: `${Number(y)}年${Number(m)}月`,
      shopName: TEST_SHOP.name,
      reports: data.reports,
      payments: data.payments,
      advances: [],
      settings: data.settings,
      template: templateFor(businessCode),
      madeOn: testReportDate(),
      cashEvents: data.cashEvents,
    });
    return sheetShowsNumbers(sheet);
  } catch {
    // 読めなかったことは「合格にしない」形で表に出ます
    return false;
  }
}
