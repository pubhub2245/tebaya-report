import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { TEST_SHOP, separationOk } from "@/lib/keiri/tenantTrial";
import { testShopNumbersShown } from "@/lib/keiri/tenantTrialNumbers";
import { peekTestShop, readBothWays } from "@/lib/keiri/tenantTrialServer";
import {
  TEST_LOCATION,
  stepsAllDone,
  stepsSummary,
  testReportDate,
  type StepsState,
} from "@/lib/keiri/tenantTrialSteps";
import { applyTenantScope, businessCodeForScope } from "@/lib/tenantScope";
import { serverClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/tenant-trial/steps
 *
 * 「2軒目を入れる手順の **手順4・5・6** まで通ったか」を外から確かめる窓口（f5-4・f3-4）。
 *
 * ★**読むだけ**です。1行も書き込みません（通す側は /api/keiri/tenant-trial/steps/run）。
 * ★返すのは件数と○×と架空の店の名前だけ。合言葉・鍵の値・お店の番号・金額は返しません。
 *
 * ■ ここで分かること
 *   手順4 … そのお店の出店場所が1件 入っているか
 *   手順5 … そのお店の日報が1枚 入っていて、そこから「今月の利益・今の現金」が出るか
 *   手順6 … そのお店として読むと、手羽屋の数字が1件も混ざらないか
 */
export async function GET() {
  const found = await peekTestShop();
  const tenantId = found.kind === "row" ? found.row.id : null;
  const shopReady = Boolean(tenantId);

  let locationReady = false;
  let locationsUnreadable = false;
  if (tenantId) {
    try {
      const db = serverClient({ fresh: true });
      const { data, error } = await applyTenantScope<any>(
        db.from("locations").select("id") as any,
        tenantId,
      )
        .eq("name", TEST_LOCATION.name)
        .limit(1);
      if (error) locationsUnreadable = true;
      else locationReady = (data?.length ?? 0) > 0;
    } catch {
      locationsUnreadable = true;
    }
  }

  // 手順5・6：そのお店として月を読み、手羽屋と見比べる（件数だけ）
  const read = await readBothWays(tenantId);
  let reportReady = false;
  let numbersShown = false;
  if (tenantId) {
    try {
      const ym = testReportDate().slice(0, 7);
      const businessCode = businessCodeForScope(tenantId);
      // ★貼り紙⑧⑪⑫のあと、テストの店の行は公開の鍵では読めない（0件で返る）。
      //   倉庫の窓口ごしに読むためのテストの印を渡す（lib/keiri/tenantTrialServer.ts と同じ）。
      //   渡さないと、貼り紙を流した日に手順5・6 が「日報0件」で落ちる（2026-10-19・f5-4）。
      const data = await loadKeiriMonthServer({
        ym,
        businessCode,
        scope: tenantId,
        monthOnly: true,
        tenantReadTestMark: TEST_SHOP.mark,
      });
      reportReady = data.reports.length > 0;
      // 「今月の利益・今の現金」が出るかは lib/keiri/tenantTrialNumbers.ts の1か所で数える
      //   （通す側の窓口と同じものを使う。2026-10-28）
      if (reportReady) numbersShown = await testShopNumbersShown(tenantId);
    } catch {
      // 読めなかったことは「合格にしない」形で表に出ます
    }
  }

  // 手順6：分かれていると言ってよいか
  // ★手羽屋がちゃんと読めていること＋そのお店として読んだ行に**よその行が1件も無いこと**。
  //   手順5で入れた行はそのお店じしんのものなので、件数ではなく「よその行の数」で見ます。
  const separated = shopReady && separationOk(read);

  const state: StepsState = { shopReady, locationReady, reportReady, separated, numbersShown };

  return NextResponse.json(
    stampCheckWindow({
      shop: TEST_SHOP.name,
      isTestShop: true,
      steps: {
        "4_出店場所": locationReady ? "入っています" : "まだです",
        "5_日報1枚": reportReady ? "入っています" : "まだです",
        "5_数字が出るか": numbersShown ? "出ます" : "まだです",
        "6_混ざらないか": separated ? "混ざりません" : "まだです",
      },
      shopReady,
      locationReady,
      locationsUnreadable,
      reportReady,
      numbersShown,
      separated,
      allDone: stepsAllDone(state),
      tebaya: read.tebaya,
      testShop: read.testShop,
      summary: stepsSummary(state),
      runPath: "/api/keiri/tenant-trial/steps/run",
      check: "f5-4・f3-4",
      note:
        "テストの店は架空の1軒です（本物の軒数に数えないこと）。" +
        "ここで入れる行はすべて『どの店か』の印がテストの店で、名前の頭に【テスト】が付きます。" +
        "手羽屋は印が空のお店なので、毎日使う画面には1行も出ません。金額は1円も返しません",
    }),
    { status: 200, headers: CHECK_WINDOW_HEADERS },
  );
}
