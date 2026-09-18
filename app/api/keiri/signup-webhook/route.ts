import { NextRequest, NextResponse } from "next/server";
import { serverClient, checkKey } from "@/lib/supabaseServer";
import { handleSignupWebhook } from "@/lib/keiri/signupWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/keiri/signup-webhook
 *
 * 経理パッケージの申し込み（支払いが終わった）通知の受け口。
 * 通知が届くと、そのお店1軒ぶんの初期設定が自動で作られます。
 *
 * ■ 薄い入り口
 *   中身は lib/keiri/signupWebhook.ts。ここは
 *     ・署名ヘッダーと本文を取り出す
 *     ・倉庫（Supabase）への保存の仕方を渡す
 *   だけです（お客さんLINEの受け口と同じ作り）。
 *
 * ■ 手羽屋の機能は何も通りません
 *   日報・シフト・LINE には一切触れていません。
 */

/** GET = 生きているかの確認 */
export async function GET() {
  const secret = checkKey(process.env.KEIRI_SIGNUP_WEBHOOK_SECRET);
  return NextResponse.json({
    status: "OK",
    channel: "keiri-signup",
    // 値そのものは出しません（設定済み／未設定だけ）
    secret: secret.ok ? "設定済み" : secret.reason,
  });
}

export async function POST(req: NextRequest) {
  // Stripe は「Stripe-Signature」という名前で署名を送ってきます
  const signature = req.headers.get("stripe-signature");
  const bodyText = await req.text();

  const secret = checkKey(process.env.KEIRI_SIGNUP_WEBHOOK_SECRET);
  if (!secret.ok && secret.reason !== "未設定") {
    console.error(
      `[経理 申込Webhook] KEIRI_SIGNUP_WEBHOOK_SECRET が使えません（${secret.reason}）。Vercelの環境変数を貼り直してください。`,
    );
  }

  const supabase = serverClient();

  const result = await handleSignupWebhook(
    { bodyText, signature },
    {
      webhookSecret: secret.ok ? secret.key : undefined,
      alreadyExists: async (subscriptionId) => {
        const { data, error } = await supabase
          .from("keiri_tenants")
          .select("id")
          .eq("external_subscription_id", subscriptionId)
          .limit(1);
        if (error) throw new Error(`確認失敗: ${error.message}`);
        return (data?.length ?? 0) > 0;
      },
      createTenant: async (row) => {
        const { error } = await supabase.from("keiri_tenants").insert(row);
        if (error) throw new Error(`作成失敗: ${error.message}`);
      },
    },
  );

  return NextResponse.json(result.body, { status: result.status });
}
