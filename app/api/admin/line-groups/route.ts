import { NextRequest, NextResponse } from "next/server";
import { messagingApi } from "@line/bot-sdk";

import { serverClient, serviceClientOrNull, tidyPastedValue } from "@/lib/supabaseServer";
import { checkGroupPost } from "@/lib/line/groupPost";
import { LINE_BOTS, remainingMessages, toLineBot, type LineBot } from "@/lib/line/lineBots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 管理者だけ：Botを選んで、そのBotが入っているLINEグループの一覧（名前つき）と今月の残り通数を出し、
 * 選んだグループへ1通送る。Botの決まりは lib/line/lineBots.ts、送る前の確かめは lib/line/groupPost.ts。
 * ふだんの日報の送り先は変えていない。
 */

function isAdmin(req: NextRequest): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/, "").trim();
  if (!token) return false;
  const required = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
  return (
    (!!required && token === required) ||
    (!!process.env.ADMIN_PASSWORD && token === process.env.ADMIN_PASSWORD) ||
    (!!process.env.CRON_SECRET && token === process.env.CRON_SECRET)
  );
}

async function activeGroups(bot: LineBot) {
  const db = bot === "shop" ? serviceClientOrNull() ?? serverClient() : serverClient();
  const { data } = await db
    .from(LINE_BOTS[bot].table)
    .select("group_id, joined_at")
    .eq("is_active", true)
    .order("joined_at", { ascending: false });
  return (data ?? []) as { group_id: string; joined_at: string | null }[];
}

function client(bot: LineBot) {
  const token = tidyPastedValue(process.env[LINE_BOTS[bot].tokenEnv] ?? "");
  return token ? new messagingApi.MessagingApiClient({ channelAccessToken: token }) : null;
}

async function remaining(api: messagingApi.MessagingApiClient): Promise<number | null> {
  try {
    const [quota, used] = await Promise.all([api.getMessageQuota(), api.getMessageQuotaConsumption()]);
    return remainingMessages(quota as any, (used as any)?.totalUsage ?? null);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "管理者だけが使えます" }, { status: 401 });
  const bot = toLineBot(req.nextUrl.searchParams.get("bot"));
  const api = client(bot);
  const groups = await activeGroups(bot);
  const list = await Promise.all(
    groups.map(async (g) => {
      let name: string | null = null;
      let memberCount: number | null = null;
      try {
        name = api ? (await api.getGroupSummary(g.group_id)).groupName : null;
        memberCount = api ? (await api.getGroupMemberCount(g.group_id)).count : null;
      } catch {
        // Botが抜けたなどで読めない
      }
      return {
        groupId: g.group_id,
        name,
        memberCount,
        joinedAt: g.joined_at,
        isDaily: bot === "staff" && g.group_id === process.env.LINE_GROUP_ID,
      };
    }),
  );
  return NextResponse.json({
    bot,
    botLabel: LINE_BOTS[bot].label,
    groups: list,
    tokenSet: !!api,
    remaining: api ? await remaining(api) : null,
  });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "管理者だけが使えます" }, { status: 401 });
  let body: { bot?: unknown; groupId?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "入力を読み取れませんでした" }, { status: 400 });
  }
  const bot = toLineBot(body.bot);
  const api = client(bot);
  if (!api) return NextResponse.json({ error: `「${LINE_BOTS[bot].label}」の合鍵が設定されていません` }, { status: 500 });
  const groups = await activeGroups(bot);
  const problem = checkGroupPost({ groupId: body.groupId, text: body.text, knownGroupIds: groups.map((g) => g.group_id) });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  try {
    await api.pushMessage({ to: String(body.groupId).trim(), messages: [{ type: "text", text: String(body.text).trim() }] });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = err?.status ?? err?.statusCode;
    const why = status === 429 ? "今月の送れる通数を使い切っています" : `送れませんでした（${status ?? "通信"}）`;
    return NextResponse.json({ error: why }, { status: 502 });
  }
}
