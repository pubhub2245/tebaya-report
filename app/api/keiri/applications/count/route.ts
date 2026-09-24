import { NextResponse } from "next/server";

import { countApplicationsViaWindow, describePendingApplications } from "@/lib/keiri/applicationStore";
import { isMissingFunction } from "@/lib/keiri/tenantAccess";
import { serverClient, serviceClientOrNull } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「まだ手当てしていないお申し込みが何件あるか」だけを答える、小さな窓口（kp156）。
 *
 * ■ なぜ作ったか
 *   同じ数は /api/keiri/diagnose でも見られますが、あちらは受け皿ぜんぶを調べるので
 *   毎回ひらくには重すぎます。画面から 1 秒で聞けるように、数だけを返す口を分けました。
 *
 * ■ 返すもの（これだけ）
 *   countable / pending / total / latestAt。
 *   **お店の名前・お名前・メール・電話は1文字も返しません**（窓口がそもそも返しません）。
 *
 * ■ 読むだけです
 *   1行も書き込まず、誰にも知らせません。
 *   手羽屋の日報・シフト・レジ・LINE・お金の計算には一切さわっていません。
 */
export async function GET() {
  // 数を見せる所は答えを覚えさせない（kp99 と同じ理由）
  const db = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
  const result = await countApplicationsViaWindow(db, isMissingFunction);
  const described = describePendingApplications(result);

  return NextResponse.json({
    countable: described.countable,
    pending: described.pending,
    total: described.total,
    latestAt: described.latestAt,
    note: described.note,
  });
}
