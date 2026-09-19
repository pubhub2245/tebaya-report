import { NextResponse } from "next/server";
import { serverClient, serviceClientOrNull, serviceRoleKeyStatus } from "@/lib/supabaseServer";
import { summarize, summarizeDaily } from "@/lib/siteVisits";
import { describeTableError } from "@/lib/keiri/signupReadiness";
import { describeRecordStore, describeServerKey } from "@/lib/keiri/serverHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 何日ぶんまでさかのぼって数えるか */
const DAYS = 70;

/**
 * 数えた結果の「まとめ」だけを見せる窓口。
 *
 * 司令室（毎時の自動実行）がここを読んで、
 * 各案件の「サイトに来た人の数（週）」を更新する。
 *
 * ■ 出すのは合計だけ
 *   1行ずつの記録（どのページがいつ開かれたか）は外に出さない。
 *   出すのは「サイトごと・週ごとの数」だけ。
 *
 * ■ 数える道が2本ある（2026-09-19 追加）
 *   訪問の棚は「**入れることだけ許す郵便ポスト**」の形なので、
 *   サーバー側の合鍵が使えないときは**1行ずつ読み出せない**。
 *   そこで、倉庫側に置いた「数だけ答える窓口」（site_visits_summary）を
 *   2本目の道として使う。**どちらの道でも外に出るのは合計だけ。**
 *   両方だめなときだけ、これまでどおり理由を文章で返す。
 */
export async function GET() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date();

  const db = serviceClientOrNull() ?? serverClient();

  // ── 1本目：1行ずつ読む（サーバー側の合鍵が使えるとき）
  const { data, error } = await db
    .from("site_visits")
    .select("site, at")
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(50000);

  if (!error) {
    return NextResponse.json({
      ok: true,
      source: "rows",
      generatedAt: now.toISOString(),
      ...summarize(data ?? [], now),
    });
  }

  // ── 2本目：倉庫側で数えてもらい、「数」だけ受け取る
  //    （棚は郵便ポストのまま。ページ名も来た元も返ってこない）
  const agg = await db.rpc("site_visits_summary", { days: DAYS });
  if (!agg.error && Array.isArray(agg.data)) {
    return NextResponse.json({
      ok: true,
      source: "daily",
      note: "倉庫側で数えた「日ごとの数」からまとめています（1行ずつは読み出していません）。直近7日は『今日を含む7日ぶん・日本時間』です。",
      generatedAt: now.toISOString(),
      ...summarizeDaily(agg.data, now),
    });
  }

  // ── どちらもだめ：「数えられません」だけでは直し方が分からないので、理由を言い分ける。
  //    表が無い（SQLを1回流す）のか、読む許可が無い（鍵を貼り直す）のか。
  //    鍵・合言葉の値そのものは絶対に返さない。
  const serverKey = describeServerKey(serviceRoleKeyStatus());
  const store = describeRecordStore(
    { ok: false, reason: describeTableError(error.code, error.message) },
    serverKey,
  );
  return NextResponse.json(
    {
      ok: false,
      message: `まだ数えられません。${store.note}`,
      hint: "倉庫（Supabase）の SQL Editor で supabase/migrations/site_visits_summary_fn.sql を1回流すと、鍵が直らなくても「数」だけは見られるようになります。",
      server_key: serverKey,
    },
    { status: 200 },
  );
}
