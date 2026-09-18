import { NextResponse } from "next/server";
import { serverClient, serviceClientOrNull, serviceRoleKeyStatus } from "@/lib/supabaseServer";
import { summarize } from "@/lib/siteVisits";
import { describeTableError } from "@/lib/keiri/signupReadiness";
import { describeRecordStore, describeServerKey } from "@/lib/keiri/serverHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 数えた結果の「まとめ」だけを見せる窓口。
 *
 * 司令室（毎時の自動実行）がここを読んで、
 * 各案件の「サイトに来た人の数（週）」を更新する。
 *
 * ■ 出すのは合計だけ
 *   1行ずつの記録（どのページがいつ開かれたか）は外に出さない。
 *   出すのは「サイトごと・週ごとの数」だけ。
 */
export async function GET() {
  const since = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString();

  const db = serviceClientOrNull() ?? serverClient();
  const { data, error } = await db
    .from("site_visits")
    .select("site, at")
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(50000);

  if (error) {
    // ★ 「数えられません」だけでは直し方が分からないので、理由を言い分ける。
    //   表が無い（SQLを1回流す）のか、読む許可が無い（鍵を貼り直す）のか。
    //   鍵・合言葉の値そのものは絶対に返さない。
    const serverKey = describeServerKey(serviceRoleKeyStatus());
    const store = describeRecordStore(
      { ok: false, reason: describeTableError(error.code, error.message) },
      serverKey,
    );
    return NextResponse.json(
      {
        ok: false,
        message: `まだ数えられません。${store.note}`,
        server_key: serverKey,
      },
      { status: 200 },
    );
  }

  const now = new Date();
  return NextResponse.json({
    ok: true,
    generatedAt: now.toISOString(),
    ...summarize(data ?? [], now),
  });
}
