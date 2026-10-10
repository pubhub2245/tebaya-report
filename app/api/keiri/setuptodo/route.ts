import { NextResponse } from "next/server";

import { summarizeShelves } from "@/lib/keiri/shelves";
import { readShelfReports, probeCashCount } from "@/lib/keiri/shelvesProbe";
import { buildSetupTodo } from "@/lib/keiri/setupTodo";
import { describeServerKey } from "@/lib/keiri/serverHealth";
import { serviceRoleKeyRepair, serviceRoleKeyStatus } from "@/lib/supabaseServer";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/setuptodo
 *
 * 「じゅんにしかできない、一度きりの手続き」が いま何件のこっているかを、
 * **1回で**確かめる窓口（kp247）。
 *
 * ■ なぜ要るのか（2026-10-10）
 *   のこりの手続きは3つ（貼り紙・金庫を数える・サーバー側の鍵）で、
 *   確かめる窓口も3つに分かれていました。司令室の5本が毎回3か所を見に行くうえ、
 *   **じゅんが開く画面にはどれも出ていない**ので、同じお願いが積み上がります。
 *   ここは「のこり何件・どの順でやると何が前に進むか」だけを返します。
 *   経理の画面（/keiri）のいちばん上に出るのも、同じこの窓口の答えです。
 *
 * ★ 1行も書き込みません。
 * ★ 鍵・合言葉・金額・お店の名前は1文字も返しません（済み／のこり だけ）。
 * ★ 手羽屋の日報・シフト・レジ・LINE には一切触れていません。
 */
export async function GET() {
  const [reports, cash] = await Promise.all([readShelfReports(), probeCashCount()]);
  const shelfSummary = summarizeShelves(reports);

  const repair = serviceRoleKeyRepair();
  const key = describeServerKey(serviceRoleKeyStatus(), {
    repaired: repair.repaired,
    broken: repair.broken,
  });

  const todo = buildSetupTodo({
    shelves: { done: shelfSummary.done, total: shelfSummary.total },
    key: { configured: key.configured, usable: key.usable },
    cash: cash.unreadable ? null : { shelfMissing: cash.shelfMissing, counted: cash.counted },
  });

  return NextResponse.json(
    stampCheckWindow({
      what:
        "じゅんにしかできない一度きりの手続きが、いま何件のこっているか。" +
        "経理の画面（/keiri）のいちばん上に出るのと同じ答えです",
      ...todo,
      sheets: { shelves: "/keiri/sql", cash: "/keiri", key: "/keiri/key" },
      shelfDetail: `${shelfSummary.done}／${shelfSummary.total}`,
    }),
    { status: 200, headers: CHECK_WINDOW_HEADERS },
  );
}
