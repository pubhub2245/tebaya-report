import { NextResponse, type NextRequest } from "next/server";

import { buildCashCheck } from "@/lib/keiri/cashCheckScenario";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/cashcheck
 *
 * 「金庫を数えた金額と、計算上の現金の突き合わせが正しく動くか」を
 * 外から確かめる窓口（f1-4・kp233）。
 *
 * ■ なぜ要るか（2026-10-09 18:55 の検査役の気づきから）
 *   突き合わせる仕組みは本物の経理画面（/keiri）とお試し版（/keiri/demo）に
 *   入っていますが、**どちらも金額を入れてボタンを押さないと答えが出ません。**
 *   検査役が使う読み取りの道具はボタンを押せないので、
 *   「差の言葉や原因3つが正しく出るか」を外から一度も確かめられませんでした。
 *
 * ■ ここが返すもの
 *   架空のお店（お試し版と同じ数字）に対して、**本物と同じ関数**で6通り
 *   （ぴったり／ほぼ合う／金庫が少ない／金庫が多い／まだ数えていない／久しく数えていない）
 *   を計算した結果と、つじつまの検算（ok）。
 *   `?counted=123456` を付けると、その金額でも試せます。
 *
 * ★1行も書き込みません。倉庫に棚が無くても動きます（倉庫を読みません）。
 * ★金額はすべて架空のお店のもので、手羽屋の実データ・鍵・合言葉は1文字も返しません。
 */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("counted") ?? "").replace(/[,\s]/g, "");
  const asked = /^\d{1,12}$/.test(raw) ? Number(raw) : null;

  return NextResponse.json(stampCheckWindow(buildCashCheck({ countedYen: asked })), {
    status: 200,
    headers: CHECK_WINDOW_HEADERS,
  });
}
