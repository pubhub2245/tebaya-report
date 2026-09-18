import { NextResponse } from "next/server";
import { messagingApi } from "@line/bot-sdk";
import { serverClient, checkKey, serviceRoleKeyStatus } from "@/lib/supabaseServer";
import { describeRecordStore, describeServerKey } from "@/lib/keiri/serverHealth";
import {
  describeApplicationDelivery,
  describeNotify,
  type NotifyFacts,
} from "@/lib/keiri/notifyHealth";
import { paymentLinkUrl } from "@/lib/keiri/caseNumbers";
import { KEIRI_APPLY_COPY_TO, keiriApplyRecipients } from "@/lib/keiri/apply";
import { KEIRI_COMPANY } from "@/lib/keiri/legal";
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

/**
 * スタッフの LINE へ「申し込みが入りました」を届けられる状態か、**読むだけ**で確かめる。
 *
 * ★メッセージは1通も送りません。送って確かめると、その1通ぶん今月の残りが減るため。
 * ★合言葉の値そのものは返しません。
 * ★手羽屋の LINE の送り方（lib/line/sendMessage.ts）は1行も変えていません。
 */
async function checkNotify(): Promise<NotifyFacts> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const facts: NotifyFacts = {
    tokenSet: !!token,
    tokenValid: false,
    groupFound: false,
    quota: null,
  };
  if (!token) return facts;

  // 送り先。環境変数が無ければ、いつもの置き場（line_groups）から探す
  let groupId = process.env.LINE_GROUP_ID;
  if (!groupId) {
    try {
      const { data } = await serverClient()
        .from("line_groups")
        .select("group_id")
        .eq("is_active", true)
        .order("joined_at", { ascending: false })
        .limit(1)
        .single();
      groupId = data?.group_id ?? undefined;
    } catch {
      groupId = undefined;
    }
  }
  facts.groupFound = !!groupId;

  try {
    const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
    await client.getBotInfo();
    facts.tokenValid = true;
    try {
      const [quota, used] = await Promise.all([
        client.getMessageQuota(),
        client.getMessageQuotaConsumption(),
      ]);
      const limited = quota.type === "limited";
      facts.quota = {
        limited,
        limit: limited ? (quota.value ?? null) : null,
        used: typeof used.totalUsage === "number" ? used.totalUsage : null,
      };
    } catch {
      // 残りの数が分からないだけ。届くかどうかの判定は続けられる
      facts.quota = null;
    }
  } catch {
    facts.tokenValid = false;
  }
  return facts;
}

export async function GET() {
  const [tenants, settings, applications, visits, notifyFacts] = await Promise.all([
    checkTable("keiri_tenants"),
    checkTable("keiri_settings"),
    checkTable("keiri_applications"),
    checkTable("site_visits"),
    checkNotify(),
  ]);

  // サーバー側の鍵。値そのものは返さない（設定済み／未設定／壊れている だけ）
  const serverKey = describeServerKey(serviceRoleKeyStatus());

  const applicationsStore = describeRecordStore(applications, serverKey);
  const notify = describeNotify(notifyFacts);
  const delivery = describeApplicationDelivery({
    notifyOk: notify.ok,
    recordOk: applicationsStore.ok,
    // 届かなかったときに店主が開く「メールの下書き」の宛先（kp63）
    mailRecipients: keiriApplyRecipients(KEIRI_COMPANY.email, KEIRI_APPLY_COPY_TO),
  });

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
      applications: applicationsStore,
      visits: describeRecordStore(visits, serverKey),
    },
    // ★ここがいちばん大事（2026-09-19・kp60）。
    //   「申し込みボタンが押せるか」ではなく **「押された申し込みが人に届くか」**。
    //   知らせ（LINE）と控え（倉庫）の両方が死んでいると、申し込みは誰にも届かない。
    notify,
    application_delivery: delivery,
  });
}
