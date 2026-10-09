import { NextResponse } from "next/server";

import { BUILD_STAMP, parseBuildStamp } from "@/lib/buildStamp";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";

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
    stampCheckWindow({
      build: BUILD_STAMP,
      commit,
      builtAt,
      now: new Date().toISOString(),
      howto:
        "確かめたいページを開いて <meta name=\"x-build\"> の値と build を見比べてください。同じなら最新、違えば配り先が古い中身を配っています。",
      // 2026-10-09：外から読む道具が、この窓口の答えを自分の手元にためることがある。
      //   保存させない札は付けてあるが、道具側のためこみはこちらから消せないので、
      //   住所の後ろに ?v=いまの時刻 を付けてもらう（毎回ちがう住所になるのでためこめない）。
      tip: "この窓口が古い答えを返すように見えるときは、住所の後ろに ?v=（いまの時刻）を付けて開き直してください。読む道具が前の答えをためていることがあります。",
    }),
    {
      status: 200,
      // どこにも保存させない（保存されたら意味が無い）／検索結果には載せない
      headers: CHECK_WINDOW_HEADERS,
    },
  );
}
