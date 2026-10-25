import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { describeNotify, remainingMessages } from "@/lib/keiri/notifyHealth";
import { probeNotify } from "@/lib/keiri/notifyProbe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/notifycheck
 *
 * 「お申し込みが入ったときに、じゅんに知らせが届く状態か」を外から1回で確かめる窓口（f2-2）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   お申し込みが入ると、スタッフの LINE グループへ「申し込みが入りました」が飛びます。
 *   その調子は これまで診断の窓口（/api/keiri/diagnose）でしか見られず、
 *   そこは自動で読む道具にことわってある住所なので、**検査役（B2）が開けませんでした**。
 *   そのため f2-2 の裏付けは 10/4 に1通 試した結果のままで、3週間 取り直せていません
 *   （知らせが静かに止まっていても、申し込みが来るまで誰も気づけない形です）。
 *
 * ■ 返さないもの（ここが大事）
 *   **合言葉・送り先のID・お店の名前・連絡先・金額は1文字も返しません。**
 *   返すのは「設定されているか」「いま通るか」「そのグループへ届く見込みか」
 *   「今月あと何通 送れるか」と、人の言葉の1行だけです。
 *
 * ■ 1通も送りません・1行も書き込みません
 *   LINE には「様子を聞く」だけで、メッセージは送りません（今月の残りは減りません）。
 *   倉庫は送り先を探すために読むだけで、書き込みは1行もしません。
 */
export async function GET() {
  try {
    const facts = await probeNotify();
    const report = describeNotify(facts);
    return json({
      ok: report.ok,
      tokenSet: facts.tokenSet,
      tokenValid: facts.tokenValid,
      groupFound: facts.groupFound,
      groupReachable: facts.groupReachable ?? null,
      remaining: remainingMessages(facts.quota),
      quotaLimited: facts.quota ? facts.quota.limited : null,
      summary: report.note,
      note:
        "読むだけの窓口です。合言葉・送り先のID・お店の名前・金額は1文字も返しません。" +
        "LINE には様子を聞くだけで、メッセージは1通も送っていません",
    });
  } catch (e: any) {
    // 調べられなかったことを「届きます」に倒さない（分からないは分からないと出す）
    return json({
      ok: false,
      tokenSet: null,
      tokenValid: null,
      groupFound: null,
      groupReachable: null,
      remaining: null,
      quotaLimited: null,
      summary: `知らせの調子を確かめられませんでした：${String(e?.message ?? e).slice(0, 120)}`,
      note: "読むだけの窓口です。分からないときは「届く」とは言いません",
    });
  }
}

function json(body: Record<string, unknown>) {
  return NextResponse.json(stampCheckWindow(body), { headers: CHECK_WINDOW_HEADERS });
}
