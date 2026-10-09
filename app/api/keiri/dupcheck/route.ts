import { NextResponse } from "next/server";

import { buildDupCheck } from "@/lib/keiri/dupCheckScenario";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/dupcheck
 *
 * 「同じ支払いが2か所にある疑いを、押して片付けられるか」を外から確かめる窓口（f1-5・kp230）。
 *
 * ■ なぜ要るか
 *   片付ける仕組みは本物の経理画面（/keiri）に入っていますが、そこは合言葉が要るので
 *   検査役は開けません。お試し版（/keiri/demo）は架空のお店の数字を変えたくないので
 *   疑いを置いていません。＝ 外からは確かめようがありませんでした。
 *
 * ■ ここが返すもの
 *   架空のお店の日報1枚＋同じ支払いの立替1件に対して、**本物と同じ関数**で
 *   4通り（決めていない／日報だけ／立て替えだけ／別々の支払い）を計算した結果。
 *
 * ★1行も書き込みません。倉庫に棚が無くても動きます。
 * ★金額はすべて架空のお店のもので、手羽屋の実データ・鍵・合言葉は1文字も返しません。
 */
export async function GET() {
  return NextResponse.json(stampCheckWindow(buildDupCheck()), {
    status: 200,
    headers: CHECK_WINDOW_HEADERS,
  });
}
