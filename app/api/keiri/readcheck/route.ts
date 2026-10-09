import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { serverClient } from "@/lib/supabaseServer";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { resolveReadScope } from "@/lib/keiri/readScope";
import { probeTenantRpc } from "@/lib/keiri/tenantAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「お店の数字を読む窓口が、名乗っただけの相手を入れないか」を
 * **外から確かめられる**ようにする窓口（kp239・f3-4）。
 *
 * ■ なぜ要るか
 *   経理の数字をサーバー側で読む窓口（/api/keiri/month）は、
 *   お店の番号を受け取らず、合言葉から どのお店かを決めます。
 *   ところがそれは **合言葉を持っている人しか確かめられません**。
 *   検査役（B2）は合言葉を持たないので、直すところを「できた」と言われても
 *   自分で確かめられない状態でした。
 *   そこで、合言葉を1文字も使わずに確かめられる形にしました。
 *
 * ■ ここでやること（読むだけ・書き込みゼロ）
 *   ① 倉庫の窓口（お店を合言葉から探す窓口）が生きているか
 *      ★当たるはずのない合言葉（0が64個）で1回だけ叩きます。必ず0行が返ります。
 *   ② でっちあげた合言葉では入れないか（断るか）
 *   ③ 形になっていない値では、倉庫を叩く前に断るか
 *
 * ■ 返さないもの
 *   金額・お店の名前・連絡先・合言葉・鍵の値は**1文字も返しません**。
 */

/** 当たるはずのない合言葉（16進64文字） */
const IMPOSSIBLE = "0".repeat(64);

export async function GET() {
  const db = serverClient();

  // ① 倉庫の窓口が生きているか
  const probe = await probeTenantRpc(db as any);

  // ② でっちあげた合言葉。手羽屋の合言葉と比べても当たらない値を使う
  const tebayaPassword = (process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "").trim();
  const tebayaHash = tebayaPassword
    ? createHash("sha256").update(tebayaPassword, "utf8").digest("hex")
    : "";

  const made = await resolveReadScope({
    passwordHash: IMPOSSIBLE,
    tebayaHash,
    rpc: db as any,
  });

  // ③ 形になっていない値（これは倉庫を叩かずに断るのが正しい）
  const malformed = await resolveReadScope({
    passwordHash: "こんにちは",
    tebayaHash,
    rpc: db as any,
  });

  const checks = {
    /** 倉庫の窓口が生きている（合言葉からお店を探せる） */
    loginWindowAlive: probe.usable,
    /** でっちあげた合言葉では入れない */
    madeUpSecretDenied: made.outcome === "denied",
    /** 形になっていない値も入れない */
    malformedDenied: malformed.outcome === "denied",
    /** 手羽屋の合言葉が設定されている（未設定だと誰も入れない） */
    tebayaSecretConfigured: tebayaHash !== "",
  };

  const problems: string[] = [];
  if (!checks.loginWindowAlive) {
    problems.push(
      "倉庫の窓口（合言葉からお店を探す窓口）が呼べません。" +
        "このあいだ、お店の経理画面は今までどおりブラウザから読む道に落ちます",
    );
  }
  if (!checks.madeUpSecretDenied) problems.push("でっちあげた合言葉で入れてしまいます");
  if (!checks.malformedDenied) problems.push("形になっていない値で入れてしまいます");
  if (!checks.tebayaSecretConfigured) problems.push("手羽屋の合言葉が未設定です");

  const ok = problems.length === 0;

  return NextResponse.json(
    stampCheckWindow({
      ok,
      checks,
      problems,
      summary: ok
        ? "お店の数字を読む窓口（/api/keiri/month）は、合言葉から お店を決めています。" +
          "でっちあげた合言葉・形になっていない値は、どちらも断りました。" +
          "画面から送られてきたお店の番号は受け取りません（受け取る道がコードにありません）。"
        : `確かめられなかったことがあります：${problems.join("／")}`,
      note:
        "読むだけの窓口です。金額・お店の名前・連絡先・合言葉・鍵の値は1文字も返しません。" +
        "お店ごとに棚の鍵で守るところ（倉庫の決まりを絞る）は、まだ残っています。",
      remaining:
        "ブラウザから倉庫を直に読む道は、棚の鍵の決まりを1回 流すまで閉じられません（f3-4 はまだ合格ではありません）",
    }),
    { headers: CHECK_WINDOW_HEADERS },
  );
}
