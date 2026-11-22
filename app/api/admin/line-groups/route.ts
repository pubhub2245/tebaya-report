import { NextRequest, NextResponse } from "next/server";
import { messagingApi } from "@line/bot-sdk";

import { serverClient } from "@/lib/supabaseServer";
import { checkGroupPost } from "@/lib/line/groupPost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 管理者だけ：Bot「手羽屋業務連絡」が入っているLINEグループの一覧（名前つき）と、選んだグループへの1通送信。
 * 中身の決まりは lib/line/groupPost.ts。ふだんの日報の送り先は変えていない。
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

async function activeGroups() {
  const { data } = await serverClient()
    .from("line_groups")
    .select("group_id, joined_at")
    .eq("is_active", true)
    .order("joined_at", { ascending: false });
  return (data ?? []) as { group_id: string; joined_at: string | null }[];
}

function client() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  return token ? new messagingApi.MessagingApiClient({ channelAccessToken: token }) : null;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "管理者だけが使えます" }, { status: 401 });
  const api = client();
  const groups = await activeGroups();
  const list = await Promise.all(
    groups.map(async (g) => {
      let name: string | null = null;
      try {
        name = api ? (await api.getGroupSummary(g.group_id)).groupName : null;
      } catch {
        name = null; // Botが抜けたなどで読めない
      }
      return {
        groupId: g.group_id,
        name,
        joinedAt: g.joined_at,
        isDaily: g.group_id === process.env.LINE_GROUP_ID,
      };
    }),
  );
  return NextResponse.json({ groups: list, tokenSet: !!api });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "管理者だけが使えます" }, { status: 401 });
  const api = client();
  if (!api) return NextResponse.json({ error: "LINEの合鍵が設定されていません" }, { status: 500 });
  let body: { groupId?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "入力を読み取れませんでした" }, { status: 400 });
  }
  const groups = await activeGroups();
  const problem = checkGroupPost({ groupId: body.groupId, text: body.text, knownGroupIds: groups.map((g) => g.group_id) });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  try {
    await api.pushMessage({ to: String(body.groupId).trim(), messages: [{ type: "text", text: String(body.text).trim() }] });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: `送れませんでした（${err?.status ?? "通信"}）` }, { status: 502 });
  }
}
