import { NextResponse } from "next/server";
import { messagingApi } from "@line/bot-sdk";
import {
  serverClient,
  serviceClientOrNull,
  checkKey,
  serviceRoleKeyStatus,
  serviceRoleKeyRepair,
} from "@/lib/supabaseServer";
import { describeServerKey } from "@/lib/keiri/serverHealth";
import {
  describeApplicationStore,
  probeApplicationStore,
  describePendingApplications,
  countApplicationsViaWindow,
  type ApplicationCountResult,
  type PendingApplications,
} from "@/lib/keiri/applicationStore";
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
import type { RecordStoreReport } from "@/lib/keiri/serverHealth";
import { probeTenantRpc, isMissingFunction } from "@/lib/keiri/tenantAccess";
import {
  describeAdvanceTenantColumn,
  type AdvanceTenantColumnReport,
} from "@/lib/keiri/advanceScope";

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
 * ★ 記録は1行も増やしません。1か所だけ「**わざと断られる行**」を入れてみますが、
 *   決まりに必ず断られるので残りません（申し込みの控えが本当に残るかの確かめ・kp103）。
 * ★ 手羽屋の日報・シフト・LINE には一切触れていません。
 */

/** その置き場（表）が本番にあって読めるかを、1行だけ読んで確かめる */
async function checkTable(table: string): Promise<TableCheck> {
  try {
    // サーバー側の合鍵が使えるならそちらで読む。
    // ＝ ここが「直した鍵が本当に通るか」の実地の確かめにもなる（2026-09-19・kp67）。
    const supabase = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
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
      const { data } = await serverClient({ fresh: true })
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

/**
 * お申し込みの控え（keiri_applications）が **本当に残るか** を確かめる（kp103）。
 *
 * ■ なぜ「1行読んでみる」ではだめなのか
 *   この棚は 9/19 に「入れることだけ許す郵便ポスト」の形にした。
 *   ＝ **外から1行ずつ読めないのが正しい状態**なのに、読めないことを理由に
 *   「読む許可がありません（鍵が使えていない可能性）」と報告していた。
 *   訪問（site_visits）で直したのと同じ形の見落とし。
 *   いま申し込みの受け口は「LINE の知らせ（今月あと数通）」と「この控え」の2本だけなので、
 *   ここでうそをつくと **送ってよいかの判断をまちがえる**。
 *
 * ■ どう確かめるか
 *   **わざと決まりに引っかかる行**を1件入れてみて、断られ方を読む。
 *   決まりは status='new' しか通さないので必ず断られ、**行は1件も増えない**。
 *
 * ★1行も残しません。誰にも知らせません。連絡先も入れません。
 */
async function checkApplications(direct: TableCheck): Promise<RecordStoreReport> {
  // 1行ずつ読めた＝サーバー側の合鍵が生きている。いちばん強い状態
  if (direct.ok) return describeApplicationStore({ outcome: "unknown", detail: "" }, true);
  const db = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
  const probe = await probeApplicationStore(db);
  return describeApplicationStore(probe, false);
}

/**
 * 「まだ手当てしていない申し込みが何件あるか」を数える（kp124）。
 *
 * ■ なぜ要るのか
 *   いま申し込みが1件入ったとき、人が気づける道は LINE の知らせ1本だけ。
 *   今月の残り通数には限りがあり、使い切ると知らせが届かない。
 *   **最初の1件を取りこぼすのがいちばん痛い**ので、
 *   「棚に何件たまっているか」を、この診断からいつでも見られるようにする。
 *
 * ■ 数え方の優先順
 *   1. 合鍵が生きて1行ずつ読める → 棚をそのまま数える
 *   2. 数だけ答える窓口（keiri_applications_summary）を叩く
 *   3. どちらも駄目 → 「まだ数えられません」と正直に出す
 *
 * ★読むだけ。1行も書き込みません。
 * ★返すのは**数と時刻だけ**。お店の名前・ご連絡先は1文字も返しません。
 */
async function checkPendingApplications(direct: TableCheck): Promise<PendingApplications> {
  // 1. 1行ずつ読める＝合鍵が生きている。棚をそのまま数えるのがいちばん確か
  if (direct.ok) {
    try {
      const db = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
      const [pending, total, latest] = await Promise.all([
        db.from("keiri_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
        db.from("keiri_applications").select("id", { count: "exact", head: true }),
        db
          .from("keiri_applications")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (!pending.error && !total.error) {
        const rows = (latest.data ?? []) as { created_at?: string | null }[];
        const result: ApplicationCountResult = {
          outcome: "counted",
          readable: true,
          count: {
            pending: pending.count ?? 0,
            total: total.count ?? 0,
            latestAt: rows[0]?.created_at ?? null,
          },
        };
        return describePendingApplications(result);
      }
    } catch {
      // 数えられなかっただけ。下の窓口に落ちる
    }
  }

  // 2. 数だけ答える窓口を叩く（棚は郵便ポストのままでよい）
  const db = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
  const viaWindow = await countApplicationsViaWindow(db, isMissingFunction);
  return describePendingApplications(viaWindow);
}

/**
 * 訪問（site_visits）が数えられる状態かを確かめる。
 *
 * ■ なぜ専用にするのか（2026-09-19・kp89）
 *   訪問の棚は 9/19 に「入れることだけ許す郵便ポスト」の形にした（site_visits_insert_only.sql）。
 *   ＝ **直接1行ずつ読めないのが正しい状態**。
 *   それまでの診断は1行読んでみるだけだったので、正しい状態を
 *   「読む許可がありません（鍵が使えていない可能性）」と**まちがって報告していた**。
 *   実際には倉庫側の「数だけ答える窓口」（site_visits_summary）が動いていて、
 *   /api/hit/summary からは数が見られる。診断がうそをつくと、
 *   「送ってよいか」の判断をまちがえるので、ここは実際に窓口を叩いて確かめる。
 *
 * ★読むだけ。1行も書き込みません。ページ名も来た元も受け取りません（数だけ）。
 */
async function checkVisits(direct: TableCheck): Promise<RecordStoreReport> {
  // 1行ずつ読めた＝サーバー側の合鍵が生きている。いちばん強い状態
  if (direct.ok) {
    return { ok: true, readable: true, note: "数えられます（1行ずつ読めています）" };
  }
  // 読めない。では「数だけ答える窓口」は動くか
  try {
    const db = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
    const agg = await db.rpc("site_visits_summary", { days: 7 });
    if (!agg.error && Array.isArray(agg.data)) {
      return {
        ok: true,
        readable: false,
        note:
          "数えられます。棚は「入れるだけの郵便ポスト」にしてあるので1行ずつは読めません" +
          "（これが正しい状態です）。日ごとの数は /api/hit/summary で見られます",
      };
    }
  } catch {
    // 窓口も叩けなかった。下の「まだ数えられません」に落ちる
  }
  return {
    ok: false,
    readable: false,
    note:
      (direct.reason ?? "読めませんでした") +
      "。数だけ答える窓口（site_visits_summary）も使えませんでした。" +
      "倉庫の SQL Editor で supabase/migrations/site_visits_summary_fn.sql を1回流してください",
  };
}

/**
 * お店の置き場の「窓口」が本番で使えるかを、実際に1回叩いて確かめる（kp93）。
 *
 * ★合うはずのない合言葉（0が64個）で叩きます。
 *   1行も書き込まず、誰にも知らせません。返ってくるのは必ず0行です。
 */
async function checkTenantRpc(): Promise<{ usable: boolean; note: string }> {
  try {
    const probe = await probeTenantRpc(serverClient({ fresh: true }));
    if (probe.usable) {
      return {
        usable: true,
        note:
          "使えます。サーバー側の鍵が壊れていても、申し込んだお店は初回設定と" +
          "合言葉での入室ができます（棚の中身は窓口からも見えません）",
      };
    }
    // ★「窓口がまだ無い」と「呼んだが失敗した」を言い分ける。
    //   直し方がまったく違うので、ひとまとめにすると判断をまちがえる（kp89 と同じ考え方）。
    const missing = probe.reason === "窓口がまだありません";
    return {
      usable: false,
      note: missing
        ? "窓口がまだありません。倉庫の SQL Editor で supabase/migrations/keiri_tenant_rpc.sql を1回流してください"
        : `窓口を呼べませんでした（${probe.reason ?? "理由は分かりません"}）。SQL はもう流してあるので、原因は別にあります`,
    };
  } catch {
    return { usable: false, note: "窓口を叩けませんでした（通信の失敗）" };
  }
}

/**
 * 立替の棚に「どの店のものか」の印の欄ができているかを、**読むだけ**で確かめる。
 *
 * ★立替の中身は1行も返しません。印の欄を指定して1行読んでみて、
 *   断られるかどうかだけを見ます（kp127 を流したあとの受け取り確認）。
 * ★手羽屋の画面には何も影響しません。ここは診断だけです。
 */
async function checkAdvanceTenantColumn(): Promise<AdvanceTenantColumnReport> {
  try {
    const supabase = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
    const { error } = await supabase
      .from("keiri_advance_expenses")
      .select("tenant_id")
      .limit(1);
    return describeAdvanceTenantColumn({ ok: !error, error });
  } catch {
    return describeAdvanceTenantColumn({ ok: false, error: null });
  }
}

export async function GET() {
  const [tenants, settings, applications, visits, notifyFacts, tenantRpc, advanceColumn] =
    await Promise.all([
      checkTable("keiri_tenants"),
      checkTable("keiri_settings"),
      checkTable("keiri_applications"),
      checkTable("site_visits"),
      checkNotify(),
      checkTenantRpc(),
      checkAdvanceTenantColumn(),
    ]);

  // サーバー側の鍵。値そのものは返さない（設定済み／未設定／壊れている だけ）
  const repair = serviceRoleKeyRepair();
  const serverKey = describeServerKey(serviceRoleKeyStatus(), {
    repaired: repair.repaired,
    broken: repair.broken,
  });

  const applicationsStore = await checkApplications(applications);
  const applicationsPending = await checkPendingApplications(applications);
  const visitsStore = await checkVisits(visits);
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
    // ★鍵が使えないと、読めていてもお店は1歩も進めない（kp76）
    serverKeyUsable: serverKey.usable,
    // ★ただし倉庫の窓口があれば、鍵が壊れていても進める（kp93）
    tenantRpcUsable: tenantRpc.usable,
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
    // ★お店の置き場の窓口（kp93）。鍵の貼り直し（kp55）を待たずに、
    //   払ったお店が初回設定と入室をできるかどうかがここで分かる。
    tenant_rpc: tenantRpc,
    records: {
      applications: applicationsStore,
      // ★「まだ手当てしていない申し込み ◯件」（kp124）。
      //   知らせ（LINE）を見落としても、ここを見れば取りこぼしに気づける。
      //   数と時刻だけで、お店の名前・ご連絡先は返さない。
      applications_pending: applicationsPending,
      visits: visitsStore,
    },
    // ★ここがいちばん大事（2026-09-19・kp60）。
    //   「申し込みボタンが押せるか」ではなく **「押された申し込みが人に届くか」**。
    //   知らせ（LINE）と控え（倉庫）の両方が死んでいると、申し込みは誰にも届かない。
    // ★「お金を払ったお店が、月15,000円に含まれるものを本当に使えるか」。
    //   申し込めるか（ready）とは別の話なので、ready の判定には入れない。
    //   欠けていても申し込みは受け取れるが、**払った人が使えない**のはいちばん困るので、
    //   1回開くだけで分かるようにしてある（2026-09-24・kp127 の受け取り確認）。
    paid_shop_features: {
      advance_expenses: advanceColumn,
    },
    notify,
    application_delivery: delivery,
  });
}
