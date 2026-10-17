import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { TEST_SHOP, separationOk } from "@/lib/keiri/tenantTrial";
import { peekTestShop, readBothWays } from "@/lib/keiri/tenantTrialServer";
import {
  TEST_LOCATION,
  buildTestLocation,
  buildTestReport,
  rollbackNeeded,
  stepsSummary,
  testReportDate,
  type StepsState,
  type TebayaVisible,
} from "@/lib/keiri/tenantTrialSteps";
import { readTenantReportsViaWindow } from "@/lib/keiri/loadMonthServer";
import { serverClient } from "@/lib/supabaseServer";
import { applyTenantScope } from "@/lib/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/keiri/tenant-trial/steps/run
 *
 * 2軒目を入れる手順の **手順4（出店場所を入れる）と手順5（日報を1枚 打つ）** を、
 * テストの店（架空の1軒）に対して通す（f5-4・f3-4）。
 *
 * ■ 入れるのは固定の2行だけです
 *   出店場所1件（【テスト】テスト広場）と、日報1枚（架空の金額）。
 *   中身は lib/keiri/tenantTrialSteps.ts に書いた固定の値で、**外から指定できません**。
 *   すでに入っていれば何も作りません（何度 送っても増えません）。
 *
 * ■ 手羽屋には1行も混ざりません
 *   入れる行はどちらも「どの店か」の印がテストの店です。
 *   手羽屋は**印が空のお店**として読んでいるので、毎日使う画面には出ません。
 *   それでも念のため、**入れる前と後で手羽屋に見える件数を数え、
 *   1件でも動いたら（または数えられなかったら）入れた行をその場で取り消します**。
 *   取り消すのは**この回で作った行だけ**で、番号を名指しして消します。ほかの行には触れません。
 *   ★消えた件数まで数えます。⑧のあと、公開の鍵では印つきの日報は0行しか消えないため
 *     （2026-10-17 実測）、消えなかったときは「残っています」と正直に書きます。
 *
 * ■ 手順5（日報1枚）は、いまは貼り紙⑥の中で入ります（2026-10-17）
 *   ⑧で足す「印が空の行だけ 読んでよい」の決まりは、**入れた行を読み返すときにも効く**ので、
 *   公開の鍵では印つきの日報を入れられません（PostgreSQL 16 で実測）。
 *   そのため貼り紙⑥が日報1枚まで入れ、ここは「もう入っていました」と答えるのが
 *   ふだんの形です。下の入れる道は、貼り紙より前の倉庫のための控えです。
 *
 * ■ テストの店がまだ無いときは何もしません
 *   手順1〜3（お店の行と初回設定）は /keiri/sql の貼り紙⑥が1回で済ませます。
 *   それが済むまでは、ここは「まだできません」と答えるだけです。
 */

/** 手羽屋に見える件数（印が空のものだけ）を数える。読めなければ null */
async function countTebayaVisible(): Promise<TebayaVisible> {
  const db = serverClient({ fresh: true });
  const one = async (table: string): Promise<number | null> => {
    try {
      const { count, error } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .is("tenant_id", null);
      if (error) return null;
      return typeof count === "number" ? count : null;
    } catch {
      return null;
    }
  };
  return { locations: await one("locations"), reports: await one("daily_reports") };
}

export async function POST() {
  const found = await peekTestShop();
  const tenantId = found.kind === "row" ? found.row.id : null;
  if (!tenantId) {
    const state: StepsState = {
      shopReady: false,
      locationReady: false,
      reportReady: false,
      separated: false,
      numbersShown: false,
    };
    return NextResponse.json(
      stampCheckWindow({
        shop: TEST_SHOP.name,
        isTestShop: true,
        ran: "何もしていません（テストの店がまだありません）",
        wrote: 0,
        summary: stepsSummary(state),
        next: "/keiri/sql の貼り紙⑥を1回 流すと、手順1〜3と手順5（日報1枚）がその中で終わります",
        check: "f5-4・f3-4",
      }),
      { status: 200, headers: CHECK_WINDOW_HEADERS },
    );
  }

  const startedAt = Date.now();
  const db = serverClient({ fresh: true });
  const before = await countTebayaVisible();

  const madeLocationIds: string[] = [];
  const madeReportIds: string[] = [];
  const problems: string[] = [];

  // --- 手順4：出店場所を1件 ------------------------------------------------
  let locationReady = false;
  try {
    const { data: already, error: readErr } = await applyTenantScope<any>(
      db.from("locations").select("id") as any,
      tenantId,
    )
      .eq("name", TEST_LOCATION.name)
      .limit(1);
    if (readErr) problems.push("出店場所の棚を読めませんでした");
    else if ((already?.length ?? 0) > 0) locationReady = true;
    else {
      const { data, error } = await db
        .from("locations")
        .insert(buildTestLocation(tenantId))
        .select("id")
        .maybeSingle();
      if (error || !data) problems.push(`出店場所を入れられませんでした（${error?.message ?? "理由なし"}）`);
      else {
        madeLocationIds.push(String((data as { id: unknown }).id));
        locationReady = true;
      }
    }
  } catch {
    problems.push("出店場所の出し入れで通信に失敗しました");
  }

  // --- 手順5：日報を1枚 ----------------------------------------------------
  let reportReady = false;
  const reportDate = testReportDate();
  try {
    // ★貼り紙⑧のあと、テストの店の行は**公開の鍵では読めません**（f3-4・kp251）。
    //   そのままだと「もう入っているか」が毎回「入っていない」に見えて、
    //   押すたびに同じ日報が増えてしまいます。
    //   そこで倉庫の窓口ごしに聞き、窓口がまだ無い倉庫では今までどおり棚を読みます。
    const viaWindow = await readTenantReportsViaWindow(db as any, {
      testMark: TEST_SHOP.mark,
      from: reportDate,
      to: reportDate,
    });
    const { data: already, error: readErr } =
      viaWindow.outcome === "ok"
        ? { data: viaWindow.rows, error: null as any }
        : await db
            .from("daily_reports")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("date", reportDate)
            .limit(1);
    if (readErr) problems.push("日報の棚を読めませんでした");
    else if ((already?.length ?? 0) > 0) reportReady = true;
    else {
      const { data, error } = await db
        .from("daily_reports")
        .insert(buildTestReport(tenantId, reportDate))
        .select("id")
        .maybeSingle();
      if (error || !data) {
        const why = error?.message ?? "理由なし";
        // ★⑧（印が空の行だけ 読んでよい）のあとは、公開の鍵では
        //   印つきの日報を入れて番号を受け取ることができません（2026-10-17 実測）。
        //   ここで黙って「入れられませんでした」と言うと、原因を探し直すことになります。
        problems.push(
          /row-level security|row level security/i.test(why)
            ? "日報は公開の鍵では入れられません（⑧の読む決まりが、入れた行の読み返しにも効くため）。" +
              "手順5は /keiri/sql の貼り紙⑥の中で入ります。貼り紙を1回 流してください"
            : `日報を入れられませんでした（${why}）`,
        );
      }
      else {
        madeReportIds.push(String((data as { id: unknown }).id));
        reportReady = true;
      }
    }
  } catch {
    problems.push("日報の出し入れで通信に失敗しました");
  }

  // --- 入れる前と後で、手羽屋に見える件数が動いていないか ------------------
  const after = await countTebayaVisible();
  const wrote = madeLocationIds.length + madeReportIds.length;
  let rolledBack = false;
  if (wrote > 0 && rollbackNeeded(before, after)) {
    rolledBack = true;
    // ★消えた件数まで数えます（2026-10-17）。
    //   ⑧のあと、公開の鍵では印つきの日報は**0行しか消えません**（エラーにならず、
    //   黙って何も起きない）。件数を見ないと「取り消しました」と嘘を書くことになります。
    const removeOne = async (table: string, id: string, label: string) => {
      try {
        const { error, count } = await db
          .from(table)
          .delete({ count: "exact" })
          .eq("id", id)
          .eq("tenant_id", tenantId);
        if (error) problems.push(`取り消しに失敗した${label}があります（${error.message}）`);
        else if (count === 0)
          problems.push(
            `${label}を取り消せませんでした（公開の鍵では、印が付いた行は消せません）。` +
              "本番に1行 残っています。倉庫の画面から消してください",
          );
      } catch {
        problems.push(`取り消しに失敗した${label}があります`);
      }
    };
    for (const id of madeLocationIds) await removeOne("locations", id, "出店場所");
    for (const id of madeReportIds) await removeOne("daily_reports", id, "日報");
    locationReady = false;
    reportReady = false;
  }

  const read = await readBothWays(tenantId);
  const separated = !rolledBack && separationOk(read);
  const state: StepsState = {
    shopReady: true,
    locationReady,
    reportReady,
    separated,
    numbersShown: reportReady,
  };

  return NextResponse.json(
    stampCheckWindow({
      shop: TEST_SHOP.name,
      isTestShop: true,
      ran:
        wrote === 0
          ? "もう入っていました。何も作っていません"
          : `この回で ${wrote} 行 入れました（出店場所 ${madeLocationIds.length}・日報 ${madeReportIds.length}）`,
      wrote,
      rolledBack,
      tebayaUnchanged: !rolledBack,
      locationReady,
      reportReady,
      separated,
      elapsedMs: Date.now() - startedAt,
      problems,
      summary: stepsSummary(state, rolledBack),
      readPath: "/api/keiri/tenant-trial/steps",
      check: "f5-4・f3-4",
      note:
        "入れた行はすべて『どの店か』の印がテストの店で、名前の頭に【テスト】が付きます。" +
        "手羽屋の行は1行も読み書きしていません（消したのはこの回で作った行だけ）。金額は1円も返しません",
    }),
    { status: 200, headers: CHECK_WINDOW_HEADERS },
  );
}
