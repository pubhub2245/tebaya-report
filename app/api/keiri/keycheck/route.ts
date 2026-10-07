import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS } from "@/lib/keiri/checkWindow";
import {
  KEY_BLOCKED,
  KEY_FIX_STEPS,
  keyFixHeadline,
  keyFixLevel,
  keyFixNeeded,
} from "@/lib/keiri/keyFix";
import { describeServerKey } from "@/lib/keiri/serverHealth";
import { serviceRoleKeyRepair, serviceRoleKeyStatus } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/keycheck
 *
 * 「サーバー側の鍵が使える状態か」だけを外から確かめる窓口。
 *
 * ★**読むだけ**です。1行も書き込みません。
 * ★**鍵の値・合言葉・環境変数の中身は1文字も返しません。**
 *   返すのは「設定されているか」「使えるか」「なぜ使えないか（文字数などの形だけ）」と、
 *   直すまで止まっているものの一覧です。
 *
 * ■ なぜ要るか
 *   この鍵が使えないあいだ、毎日の自動の控え（バックアップ）が取れず、
 *   2軒目のお店の行も作れません（仕上げの f5-4 の1手目）。
 *   いちばん大きい行き止まりなのに、どこを見れば分かるのかが1つに決まっていませんでした。
 */
export async function GET() {
  const repair = serviceRoleKeyRepair();
  const report = describeServerKey(serviceRoleKeyStatus(), {
    repaired: repair.repaired,
    broken: repair.broken,
  });
  const level = keyFixLevel(report);

  return NextResponse.json(
    {
      configured: report.configured,
      usable: report.usable,
      repaired: report.repaired === true,
      level,
      headline: keyFixHeadline(level),
      needsFix: keyFixNeeded(level),
      why: report.note,
      blocked: keyFixNeeded(level) && !report.usable ? KEY_BLOCKED : [],
      steps: keyFixNeeded(level) ? KEY_FIX_STEPS : [],
      sheet: "/keiri/key",
      note: "読むだけの窓口です。鍵の値・合言葉・環境変数の中身は1文字も返しません",
    },
    { status: 200, headers: CHECK_WINDOW_HEADERS },
  );
}
