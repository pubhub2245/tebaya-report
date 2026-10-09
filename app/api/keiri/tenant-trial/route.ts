import { cannot, describe } from "./describe";

import { peekTestShop, setupElapsedMs } from "@/lib/keiri/tenantTrialServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/tenant-trial
 *
 * 「2軒目のお店を入れる手順が、こちら（Claude）だけで通ったか」を外から確かめる窓口（f5-4・f3-4）。
 *
 * ★**読むだけ**です。1行も書き込みません（作る側は /api/keiri/tenant-trial/run）。
 * ★返すのは件数と○×と架空の店の名前だけ。合言葉・鍵の値・お店の番号・本物の金額は返しません。
 *
 * ■ ここで分かること
 *   ① テストの店（架空の1軒）が倉庫にできているか
 *   ② その店の初回設定（店名・数え始めの日・金庫の起点）まで終わっているか、何分かかったか
 *   ③ その店として読むと、手羽屋の日報が1件も出ないか・立替の棚を読まないか
 *
 * ■ ここで分からないこと（正直に）
 *   手順4・5（出店場所・商品・スタッフ）はまだ通していません。
 *   ブラウザから倉庫を直に読む道（棚の鍵の決まり）も、ここでは見ていません。
 */
export async function GET() {
  // ★鍵が壊れていても確かめられます（貼り紙⑥で作った店は、経理の設定の行から分かる）
  const found = await peekTestShop();
  if (found.kind === "nokey" || found.kind === "error") {
    return cannot("倉庫との通信に失敗したので、確かめられませんでした");
  }
  if (found.kind === "none") {
    return describe({
      state: { exists: false, createdNow: false, active: false, settingsReady: false },
      tenantId: null,
      elapsedMs: null,
    });
  }
  const row = found.row;
  return describe({
    state: {
      exists: true,
      createdNow: false,
      active: row.status === "active",
      settingsReady: row.status === "active",
    },
    tenantId: row.id,
    elapsedMs: setupElapsedMs(row.created_at, row.activated_at),
    via: row.viaSettings ? "sheet" : "key",
  });
}
