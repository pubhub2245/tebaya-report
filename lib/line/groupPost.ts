/**
 * スタッフ向けBot「手羽屋業務連絡」から、入っているLINEグループを選んで1通送る（2026-11-22）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   ふだんの日報の知らせは、決まった1つのグループ（LINE_GROUP_ID）にしか送らない。
 *   Botは別のグループ（例：ばあちゃんちの引き継ぎ）にも入っているので、
 *   管理者ページから「どのグループに送るか」を選んで、お知らせを1通だけ送れるようにする。
 *
 * ★ 送り先は line_groups に記録がある（Botが入っている）グループだけ。知らない番号には送らない。
 * ★ ふだんの日報の送り先（sendLineGroupMessage）は1文字も変えていない。
 * ★ tests/lineGroupPost.test.ts で固定。
 */

export const GROUP_POST_MAX = 2000;

/** 送る前の確かめ。問題があれば理由、無ければ null */
export function checkGroupPost(input: { groupId: unknown; text: unknown; knownGroupIds: string[] }): string | null {
  const groupId = typeof input.groupId === "string" ? input.groupId.trim() : "";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!/^C[0-9a-f]{32}$/.test(groupId)) return "送り先のグループが正しくありません。";
  if (!input.knownGroupIds.includes(groupId)) return "Botが入っていないグループには送れません。";
  if (!text) return "送る文章が空です。";
  if (text.length > GROUP_POST_MAX) return `文章は${GROUP_POST_MAX}文字までです。`;
  return null;
}
