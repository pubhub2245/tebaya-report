import { NextResponse } from "next/server";

import { summarizeShelves } from "@/lib/keiri/shelves";
import { readShelfReports } from "@/lib/keiri/shelvesProbe";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/shelves
 *
 * 倉庫に流す「貼り紙」（/keiri/sql）が本番で流れたかを、**読むだけ**で確かめる窓口。
 *
 * ■ なぜ要るのか（2026-10-05・kp237）
 *   棚が無いせいで止まっている仕事が3つあり（金庫の突き合わせ・重なりの片付け・
 *   レシート写真の読み取り）、流せるのは倉庫の画面を開ける じゅんだけです。
 *   「流したかどうか」を人の記憶に頼ると、同じお願いが何度も立ちます。
 *   ここを開けば、こちら側から1回で分かります。
 *
 * ■ 読む手順は lib/keiri/shelvesProbe.ts の1つだけ（2026-10-10・kp247）
 *   「のこりの手続き」の窓口（/api/keiri/setuptodo）も同じ所を読みます。
 *   2か所に書くと、どちらかを直したときに答えが割れます。
 *
 * ★ 1行も書き込みません。中身（金額・お店の名前・連絡先）は1文字も返しません。
 * ★ 鍵・合言葉の値は返しません。
 * ★ 手羽屋の日報・シフト・レジ・LINE には一切触れていません。
 */
export async function GET() {
  const reports = await readShelfReports();
  const summary = summarizeShelves(reports);

  return jsonWindow({
    ...summary,
    sheet: "/keiri/sql",
    file: "supabase/migrations/keiri_shelves_20261005.sql",
    shelves: reports,
    // 申し込みの控えの決まり（貼り紙の0番）は、ここではなく診断の窓口で分かる
    applications_policy: {
      where: "/api/keiri/diagnose",
      note: "申し込みの控えが残るかは records.applications に出ます（この窓口では見ません）",
    },
  });
}

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
function jsonWindow(body: unknown): NextResponse {
  return NextResponse.json(stampCheckWindow(body), { status: 200, headers: CHECK_WINDOW_HEADERS });
}
