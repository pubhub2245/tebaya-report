import { NextResponse, type NextRequest } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { previousMonthRange, CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { compareReadPaths, type ReadPathNumbers } from "@/lib/keiri/readPaths";
import { defaultSettingsFor, templateFor } from "@/lib/keiri/index";
import { loadKeiriMonthDirect, type KeiriMonthData } from "@/lib/keiri/loadMonth";
import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { readIgnoreMarks } from "@/lib/keiri/expenseIgnores";
import { calcCashPosition, summarizeMonth } from "@/lib/keiri/aggregate";
import { depositsOf } from "@/lib/keiri/cashCheck";
import { findDuplicateExpenses } from "@/lib/keiri/duplicates";
import { serverClient } from "@/lib/supabaseServer";
import { TEBAYA_SCOPE } from "@/lib/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/readpaths
 *
 * 「経理の数字を読む2つの道が、同じ答えを出すか」を外から確かめる窓口（kp239・f3-4）。
 *
 * ■ なぜ要るのか
 *   手羽屋の経理の画面は、これまで**ブラウザから倉庫を直接のぞいて**数字を作っていました。
 *   その道が残っているかぎり「ブラウザが名乗った番号で帳簿が開く」形が消えないので、
 *   2026-10-11 に手羽屋もサーバー側の窓口（/api/keiri/month）に寄せました。
 *   ただし じゅんの経理の画面は合言葉の内側で、こちら（Claude）からは開けません。
 *   ＝「寄せても数字が変わっていない」ことを目で確かめられません。
 *   そこで**同じ月を2つの道に読ませて、答えの差だけを出します**。
 *
 * ■ 返すのは「差」と件数だけ
 *   売上・経費・利益の金額そのものは1円も返しません（差が0なら同じと分かります）。
 *   合言葉・鍵・お店の名前・連絡先も1文字も返しません。
 *
 * ■ 1行も書き込みません。手羽屋が毎日使う画面（日報・シフト・レジ・LINE）にも触れません。
 *
 * ■ 月を指定できます：`?ym=2026-09`（付けなければ前の月）
 */
export async function GET(req: NextRequest) {
  const asked = (req.nextUrl.searchParams.get("ym") ?? "").trim();
  const { start } = previousMonthRange(new Date());
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : start.slice(0, 7);

  try {
    const db = serverClient();
    // ① サーバー側の窓口が使う読み方（お店は合言葉から決まる道）
    const viaWindow = await loadKeiriMonthServer({
      ym,
      businessCode: CASE_BUSINESS_CODE,
      scope: TEBAYA_SCOPE,
      monthOnly: false,
      db,
    });
    if (viaWindow.reportsUnreadable || viaWindow.advancesUnreadable) {
      return jsonWindow({
        ok: false,
        ym,
        message:
          "倉庫から読めなかった棚があるので、2つの道を比べられませんでした（少し待ってから開き直してください）。",
      });
    }

    // ② 今までの読み方（ブラウザから倉庫を直接のぞく道）。
    //    同じ鍵でつないで、**画面が使うのと同じ関数**に読ませる
    const viaDirect = await loadKeiriMonthDirect({
      ym,
      scope: TEBAYA_SCOPE,
      businessCode: CASE_BUSINESS_CODE,
      fallbackSettings: defaultSettingsFor(CASE_BUSINESS_CODE),
      db: db as never,
    });

    const result = compareReadPaths(numbersOf(ym, viaWindow), numbersOf(ym, viaDirect));
    return jsonWindow({
      ok: result.same,
      ym,
      ...result,
      what: "2つの道（サーバー側の窓口／ブラウザ直読み）に同じ月を読ませて、差だけを出しています",
      note:
        "金額そのものは返していません。差が 0 ＝ 2つの道の答えが同じ、という読み方です。",
      reads: { window: "/api/keiri/month と同じ読み方", direct: "これまでの画面と同じ読み方" },
      writes: "ありません（読むだけ）",
    });
  } catch (e: any) {
    return jsonWindow({
      ok: false,
      ym,
      message: "倉庫との通信に失敗したので、2つの道を比べられませんでした。",
      reason: String(e?.message ?? e).slice(0, 200),
    });
  }
}

/** 読んだ答えを、比べられる形（件数と金額）に直す */
function numbersOf(
  ym: string,
  data: KeiriMonthData | Awaited<ReturnType<typeof loadKeiriMonthServer>>,
): ReadPathNumbers {
  const marks = readIgnoreMarks((data as KeiriMonthData).ignores ?? []);
  const summary = summarizeMonth({
    ym,
    reports: data.reports ?? [],
    template: templateFor(CASE_BUSINESS_CODE),
    settings: data.settings,
    advances: data.advances ?? [],
    ignoreMarks: marks,
  });
  const s = data.settings;
  // 画面と同じ順番・同じ材料で「いまの現金」を出す（app/keiri/page.tsx と同じ呼び方）
  const cash = calcCashPosition({
    reports: data.reports ?? [],
    payments: data.payments ?? [],
    settings: s,
    advances: data.advances ?? [],
    deposits: depositsOf(data.cashEvents ?? []),
  });
  const dupes = findDuplicateExpenses({
    ym,
    reports: data.reports ?? [],
    advances: data.advances ?? [],
  });
  return {
    reports: (data.reports ?? []).filter((r) => String(r.date ?? "").startsWith(ym)).length,
    payments: (data.payments ?? []).length,
    advances: (data.advances ?? []).length,
    cashEvents: (data.cashEvents ?? []).length,
    sales: summary.sales,
    expenseTotal: summary.expenseTotal,
    profit: summary.profit,
    cash: cash.balance,
    dupes: dupes.suspects.length,
    settingsKey: [
      s.opening_date,
      s.opening_balance,
      s.outsourcing_rate,
      s.monthly_rent,
      s.rent_start_month,
    ].join("|"),
  };
}

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
function jsonWindow(body: unknown): NextResponse {
  return NextResponse.json(stampCheckWindow(body), { status: 200, headers: CHECK_WINDOW_HEADERS });
}
