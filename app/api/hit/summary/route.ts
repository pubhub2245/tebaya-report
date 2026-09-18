import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabaseServer";
import { summarize } from "@/lib/siteVisits";

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

  const { data, error } = await serverClient()
    .from("site_visits")
    .select("site, at")
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(50000);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "まだ数えられません（倉庫に表がない可能性があります）" },
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
