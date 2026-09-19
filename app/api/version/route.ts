import { NextResponse } from "next/server";

import { BUILD_STAMP, parseBuildStamp } from "@/lib/buildStamp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「いま本番に出ているのは、どの版か」をその場で答える窓口。
 *
 * ■ 使い方（2手）
 *   1. この窓口を開く            → build の合言葉が出る
 *   2. 確かめたいページを開く    → <meta name="x-build" content="…"> が入っている
 *   → **同じなら、そのページは最新。違うなら、配り先が古い中身を配っている。**
 *
 * ■ なぜ要るか
 *   2026-09-19 だけで3回、「本番に出したのに古いままだ」という誤った報告が出て、
 *   そのたびに最優先の仕事が立ち、売る手が止まった。3回とも本番は正しく、
 *   外からページを読む道具が古い中身をおぼえていただけだった。
 *   目で価格の文字を数える確かめ方をやめて、合言葉1つで決着させる。
 *
 * ■ 出さないもの
 *   鍵・合言葉・環境変数の値は一切返さない。出すのは公開してよい
 *   「コミットの短い番号」「組み立て時刻」「いまの時刻」だけ。
 */
export async function GET() {
  const { commit, builtAt } = parseBuildStamp();

  return NextResponse.json(
    {
      build: BUILD_STAMP,
      commit,
      builtAt,
      now: new Date().toISOString(),
      howto:
        "確かめたいページを開いて <meta name=\"x-build\"> の値と build を見比べてください。同じなら最新、違えば配り先が古い中身を配っています。",
    },
    {
      status: 200,
      headers: {
        // この窓口だけは、どこにも保存させない（保存されたら意味が無い）
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
