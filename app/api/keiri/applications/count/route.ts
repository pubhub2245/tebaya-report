import { NextResponse } from "next/server";

import { countApplicationsViaWindow, describePendingApplications } from "@/lib/keiri/applicationStore";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
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
 *
 * ■ 2026-11-09 18:34 B：**外から確かめる窓口の一覧に入れました**（f2-1・f2-3）
 *   それまでこの住所は robots.txt で「読まないでください」の側に入っていたため、
 *   **外から読む道具が1文字も読めませんでした**（11/9 18:0x に A が実測）。
 *   ＝ ②（申し込みが確実に残る）の合否を外から確かめる道が、1本だけ閉じていました。
 *   返すのは**件数と、いちばん新しい申し込みの時刻だけ**で、
 *   お店の名前・お名前・メール・電話・金額・鍵は1文字も返しません
 *   （checkWindow.ts の「ここに載せてよい窓口の決まり」①②③をすべて満たします）。
 *   あわせて、ほかの窓口と同じ札（ためさせない・検索結果に載せない）と
 *   「いつ・どの版で答えたか／この答えで合否を付けてよい期限」を足します。
 */
export async function GET() {
  // 数を見せる所は答えを覚えさせない（kp99 と同じ理由）
  const db = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
  const result = await countApplicationsViaWindow(db, isMissingFunction);
  const described = describePendingApplications(result);

  return NextResponse.json(
    stampCheckWindow({
      countable: described.countable,
      // ★true＝倉庫まで届かなかった（＝測れていないだけ。受け皿が壊れたとは言わない）
      unreachable: described.unreachable,
      pending: described.pending,
      total: described.total,
      latestAt: described.latestAt,
      note: described.note,
      how:
        "棚を「何件あるか」だけ聞いています。行の中身（お店の名前・お名前・メール・電話）は" +
        "1文字も読みません。1行も書き込みません",
      /**
       * ★**この数には、確かめのために入れたテストの行も入っています**
       *   （2026-11-10・A の気づき）。数だけ答える窓口は行の中身を読まないので、
       *   こちら側ではテストの行と本物の申し込みを**見分けられません**。
       *   見分けるには倉庫の窓口に「テストの印」の欄を足す1行（貼り紙）が要ります。
       *   ＝ **total を「本物の申し込みの数」として読まないでください。**
       */
      includesTestRows: true,
      realTotal: null,
      realTotalWhy:
        "**本物の申し込みだけの数は、まだ分かりません。**この窓口は行の中身を1文字も読まないので、" +
        "テストの行（仕組みを確かめるために入れたもの）と本物の申し込みを見分けられません。" +
        "見分けるには、数だけ答える窓口に『テストの印』の欄を足す貼り紙が1枚 必要です（じゅんの手続き待ち）。" +
        "2026-11-10 の時点で、入っている行はテストの1行だけだと分かっています（A が別の道から数えました）",
      verdictHow:
        "**countable が false のときは、合否を付けないでください**" +
        "（倉庫まで届かなかった＝測れていないだけで、受け皿が壊れたとは言えません）。" +
        "countable が true なら、pending が「まだ手当てしていない数」です。" +
        "**total は『棚に入っている行の数』で、テストの行も入っています** " +
        "（＝ 本物の申し込みの数ではありません。realTotalWhy を読んでください）。" +
        "②の合否（申し込みが1件も取りこぼされずに残るか）は、pending と、" +
        "/api/keiri/notifycheck（知らせが届く状態か）で見てください",
      check: "f2-1・f2-3",
    }),
    { status: 200, headers: CHECK_WINDOW_HEADERS },
  );
}
