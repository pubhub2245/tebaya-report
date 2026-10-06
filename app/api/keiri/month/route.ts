import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { serverClient } from "@/lib/supabaseServer";
import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { resolveReadScope } from "@/lib/keiri/readScope";
import { businessCodeForScope } from "@/lib/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 経理の月の数字を、**サーバー側で読んで返す窓口**（kp239・f3-4）。
 *
 * ■ なぜ作ったか（やさしい説明）
 *   いままで経理の画面（/keiri）は、ブラウザから倉庫を直接のぞいて数字を作り、
 *   「どのお店として読むか」は**ブラウザが覚えている番号**で決めていました。
 *   ＝ 番号を書き換えれば、よそのお店の帳簿が開けてしまう形でした。
 *
 *   この窓口は、**お店の番号を受け取りません。**
 *   合言葉（戻せない形）だけを受け取り、どのお店かはサーバーが倉庫に聞いて決めます。
 *   そのお店の分だけを読んで返すので、よそのお店の数字は1円も入りません。
 *
 * ■ 返すもの
 *   画面が数字を作るのに要るものだけ（設定・日報・払った記録・立替・金庫の記録）。
 *   合言葉・お店の名前・連絡先・鍵の値は**1文字も返しません**。
 *
 * ■ 断り方
 *   合わなければ 401「合言葉が違います」の1種類だけ。
 *   「そのお店は無い」と返すと、お店がある／無いが外から分かってしまうためです。
 *
 * ■ 窓口が呼べないとき
 *   倉庫の窓口（keiri_tenant_login）がまだ無い倉庫では 503 と `fallback: true` を返し、
 *   画面は**今までどおりの読み方に戻ります**（お店が締め出されないため）。
 *
 * ■ 手羽屋の毎日の画面には触っていません
 *   日報・シフト・レジ・LINE・お金の計算は1行も変えていません。
 *   手羽屋として経理を開いたときの読み方も、今までどおりのままです。
 */

type Body = { ym?: unknown; passwordHash?: unknown };

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function denied() {
  return NextResponse.json(
    { ok: false, message: "合言葉が違います" },
    { status: 401 },
  );
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "入力を読み取れませんでした。" },
      { status: 400 },
    );
  }

  const ym = String(body.ym ?? "").trim();
  if (!YM_RE.test(ym)) {
    return NextResponse.json(
      { ok: false, message: "月の指定が正しくありません。" },
      { status: 400 },
    );
  }

  // ★お店の番号は受け取らない（画面が名乗った番号を信じない・kp239 ②）。
  //   合言葉を同じ形に直して、どのお店かは倉庫に聞いて決める。
  const tebayaPassword = (process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "").trim();
  const tebayaHash = tebayaPassword
    ? createHash("sha256").update(tebayaPassword, "utf8").digest("hex")
    : "";

  const db = serverClient();
  const resolved = await resolveReadScope({
    passwordHash: body.passwordHash,
    tebayaHash,
    rpc: db as unknown as Parameters<typeof resolveReadScope>[0]["rpc"],
  });

  if (resolved.outcome === "denied") return denied();
  if (resolved.outcome === "unavailable") {
    return NextResponse.json(
      {
        ok: false,
        fallback: true,
        message: "いまサーバー側で読めませんでした。今までどおりの読み方に戻します。",
        reason: resolved.reason,
      },
      { status: 503 },
    );
  }

  const scope = resolved.scope;

  try {
    const data = await loadKeiriMonthServer({
      ym,
      businessCode: businessCodeForScope(scope),
      scope,
      // 現金は数え始めの日から積み上げるので、その月だけでは足りない
      monthOnly: false,
      db,
    });
    return NextResponse.json({
      ok: true,
      // どのお店として読んだか（手羽屋は "tebaya"）。番号そのものは返さない
      readAs: resolved.outcome,
      ym,
      data,
    });
  } catch (e: any) {
    console.error("[経理 月の窓口] 読めませんでした：", e?.message ?? e);
    return NextResponse.json(
      {
        ok: false,
        fallback: true,
        message: "いまサーバー側で読めませんでした。今までどおりの読み方に戻します。",
      },
      { status: 503 },
    );
  }
}
