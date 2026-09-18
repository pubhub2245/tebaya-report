import { NextRequest, NextResponse } from "next/server";
import { serverClient, serviceClientOrNull } from "@/lib/supabaseServer";
import { isAllowedOrigin, toVisitRow } from "@/lib/siteVisits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「サイトに来た人」を1人ぶん数える受け口。
 *
 * 5つのサイト（Play Miyazaki・AIツールナビ・煙道ENDO・ビルドナビ・経理パッケージ）が
 * ページを開いたときに、ここへ小さな合図を送ってくる。
 *
 * ■ 守っていること
 *   ・IPアドレスもブラウザの種類（UA）も**保存しない**
 *   ・どんなときも 204（何も返さない成功）で終える。
 *     ここが失敗しても、合図を送ったサイトの表示には一切影響しない
 *   ・知らないサイト名・ロボットの合図は数えない
 *   ・手羽屋の日報・シフト・レジ・LINE には一切触れていない（表も別）
 */

function corsHeaders(origin: string | null): Record<string, string> {
  if (!isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  const done = () => new NextResponse(null, { status: 204, headers });

  // 許していない住所からの合図は、数えずに終わる（エラーにはしない）
  if (!isAllowedOrigin(origin)) return done();

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const row = toVisitRow({
      site: body.site,
      path: body.path,
      campaign: body.campaign,
      ref: body.ref,
      // UA は「ロボットかどうか」を見るためだけに使い、保存しない
      userAgent: req.headers.get("user-agent"),
    });
    if (!row) return done();

    // site_visits は鍵（RLS）が掛かっていて、通常の鍵では書けない。
    // サーバー側の合鍵が使えるならそちらを使う（全角混入を直せた場合を含む／kp67）。
    // 使えなければ今までどおり通常の鍵（＝これまでと同じ結果）。
    const db = serviceClientOrNull() ?? serverClient();
    const { error } = await db.from("site_visits").insert(row);
    if (error) {
      console.error(`[訪問カウント] 記録できませんでした: ${error.message}`);
    }
  } catch (e) {
    console.error("[訪問カウント] 合図の中身を読めませんでした", e);
  }

  return done();
}
