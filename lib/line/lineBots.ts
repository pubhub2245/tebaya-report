/**
 * 管理者ページから「どのBotで送るか」を選ぶための決まり（2026-11-24）。
 *
 * ■ やさしい説明
 *   LINEの送り手（Bot）が2つある。
 *   ・staff = スタッフ向けBot「手羽屋業務連絡」（日報の知らせ。今までどおり）
 *   ・shop  = お店の中の連絡用「手羽屋 ばあちゃんち」（@719sepmw）
 *   送れる通数はBotごとに別々なので、片方を使い切っても、もう片方で送れる。
 *
 * ★ 日報の知らせ（sendLineGroupMessage）は1文字も変えていない。
 * ★ tests/lineBots.test.ts で固定。
 */

export type LineBot = "staff" | "shop";

export const LINE_BOTS: Record<LineBot, { label: string; tokenEnv: string; secretEnv: string; table: string }> = {
  staff: {
    label: "手羽屋業務連絡",
    tokenEnv: "LINE_CHANNEL_ACCESS_TOKEN",
    secretEnv: "LINE_CHANNEL_SECRET",
    table: "line_groups",
  },
  shop: {
    label: "手羽屋 ばあちゃんち",
    tokenEnv: "LINE_SHOP_CHANNEL_ACCESS_TOKEN",
    secretEnv: "LINE_SHOP_CHANNEL_SECRET",
    table: "line_shop_groups",
  },
};

/** 分からない値は staff（今までどおり）にする */
export function toLineBot(v: unknown): LineBot {
  return v === "shop" ? "shop" : "staff";
}

/** 今月あと何通送れるか。上限が無い（none）なら null、読めなければ null */
export function remainingMessages(quota: { type?: string; value?: number } | null, used: number | null): number | null {
  if (!quota || quota.type !== "limited" || typeof quota.value !== "number" || typeof used !== "number") return null;
  return Math.max(0, quota.value - used);
}

/** webhook のイベントから、入った／抜けたグループを拾う（返事はしない） */
export function groupMembershipChanges(events: any[]): { joined: string[]; left: string[] } {
  const joined: string[] = [];
  const left: string[] = [];
  for (const e of Array.isArray(events) ? events : []) {
    const id = e?.source?.type === "group" ? e?.source?.groupId : null;
    if (typeof id !== "string" || !/^C[0-9a-f]{32}$/.test(id)) continue;
    if (e.type === "leave") left.push(id);
    else if (!joined.includes(id)) joined.push(id); // join だけでなく、グループで何か起きたら「入っている」と分かる
  }
  return { joined: joined.filter((g) => !left.includes(g)), left };
}
