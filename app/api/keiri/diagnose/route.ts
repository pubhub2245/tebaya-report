import { NextResponse } from "next/server";
import { serverClient, checkKey, serviceRoleKeyStatus } from "@/lib/supabaseServer";
import { describeRecordStore, describeServerKey } from "@/lib/keiri/serverHealth";
import { paymentLinkUrl } from "@/lib/keiri/caseNumbers";
import {
  buildSignupReadiness,
  describeTableError,
  STRIPE_MANUAL_SETUP,
  type TableCheck,
} from "@/lib/keiri/signupReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/diagnose
 *
 * 経理パッケージの「申し込みが入ったとき、人の手を借りずに使い始められるか」を
 * 外から1回で確かめるための診断。
 * お客さんLINEの診断（/api/line/customer/diagnose）と同じ作りです。
 *
 * ■ なぜ要るのか
 *   紹介のURLを知り合いの店主に送る前に、支払いのあとが本当につながっているかを
 *   確かめるため。お金だけ払えて使い始められない、がいちばん困る失敗なので。
 *   判定の中身は lib/keiri/signupReadiness.ts にあり、ここは
 *   「調べる → 渡す → 返す」だけです。
 *
 * ★ 合言葉・鍵の値そのものは絶対に返しません（設定済み／未設定だけ）。
 * ★ 読むだけです。1行も書き込みません。
 * ★ 手羽屋の日報・シフト・LINE には一切触れていません。
 */

/** その置き場（表）が本番にあって読めるかを、1行だけ読んで確かめる */
async function checkTable(table: string): Promise<TableCheck> {
  try {
    const supabase = serverClient();
    const { error } = await supabase.from(table).select("*").limit(1);
    if (!error) return { ok: true, reason: null };
    return { ok: false, reason: describeTableError(error.code, error.message) };
  } catch {
    return { ok: false, reason: "読めませんでした（通信の失敗）" };
  }
}

export async function GET() {
  const [tenants, settings, applications, visits] = await Promise.all([
    checkTable("keiri_tenants"),
    checkTable("keiri_settings"),
    checkTable("keiri_applications"),
    checkTable("site_visits"),
  ]);

  // サーバー側の鍵。値そのものは返さない（設定済み／未設定／壊れている だけ）
  const serverKey = describeServerKey(serviceRoleKeyStatus());

  const readiness = buildSignupReadiness({
    paymentLink: paymentLinkUrl(),
    secret: checkKey(process.env.KEIRI_SIGNUP_WEBHOOK_SECRET),
    tenants,
    settings,
  });

  return NextResponse.json({
    ...readiness,
    // ★ Stripe 側の「支払いのあとの戻り先」はここからは見えません。
    //    人が Stripe の画面で1回だけ設定します（下の値のとおりに）。
    manual_check: {
      stripe_return_url: STRIPE_MANUAL_SETUP.returnUrl,
      stripe_webhook_url: STRIPE_MANUAL_SETUP.webhookUrl,
      stripe_webhook_event: STRIPE_MANUAL_SETUP.webhookEvent,
    },
    // ★ ここから下は「申し込めるか」ではなく「入った申し込みと訪問が記録に残るか」。
    //   カード決済が無くても申し込みは受け取れる（LINE で知らせる）ので、
    //   上の ready の判定には入れない。欠けていても行き止まりにはならない。
    server_key: serverKey,
    records: {
      applications: describeRecordStore(applications, serverKey),
      visits: describeRecordStore(visits, serverKey),
    },
  });
}
