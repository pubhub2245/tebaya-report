/**
 * ご案内ページ（/keiri/case）の「いちばん上に何を出すか」を決める1か所（kp209・2026-10-01）。
 *
 * ■ なぜ要るか（実測にもとづきます）
 *   配る紙（/keiri/card）のQRの行き先は、このご案内ページ（合言葉 `card`）です。
 *   ところが申し込みの欄はページの**下のほう**にあり、
 *   立ち話のその場で下まで読み進めてもらう時間はありません。
 *   実測でも、紙から来た訪問3件（2026-09-27 夜）はどれも申し込みに届いていません。
 *   そこで**紙から来た人のときだけ**、申し込みの欄をいちばん上に出します。
 *
 * ■ 決めごと（ここを外さないこと）
 *   - 並べ替えるのは **紙から来た人（合言葉 `card`）だけ**。
 *     合言葉なし・`app`・`show`・`trial`・`gh` の見え方は1文字も変えない。
 *   - **言葉を1つも新しく作らない。** いちばん上に出すのは
 *     紙に刷ってある文（lib/keiri/card.ts）と、値段の1行（lib/keiri/caseNumbers.ts）だけ。
 *     紙と画面で言い方が違うと、読み取った人が別の商品だと思う。
 *   - 値段・解約の条件・特定商取引法のページは**1文字も変えない**（並び順だけを変える）。
 *   - 入力欄は**1つだけ**置く（同じページに2つ置くと、欄の名札が二重になって
 *     ふだんの押し間違いが起きる）。上に出す回は、下の欄を出さない。
 *   - 合言葉の判定は、訪問を数えるときと**同じ掃除**（cleanCampaign）を通す。
 *     古い記録に混じった `card`（末尾に余計な1文字）の形でも同じ1つとして扱う。
 */

import { cleanCampaign } from "../siteVisits";
import { CARD_AUDIENCE, CARD_FROM_KEY, CARD_SUBLINE } from "./card";

/**
 * 申し込みの欄をいちばん上に出す合言葉。
 * いまは紙の札（card）だけ。増やすときはここに足す（検算も対で直す）。
 */
export const CASE_APPLY_FIRST_KEYS: readonly string[] = [CARD_FROM_KEY];

/**
 * この訪問は「申し込みの欄を先に出す」側か。
 *
 * 住所の `?from=` の値をそのまま渡してよい（配列でも、空でも落ちない）。
 */
export function showsApplyFirst(rawFrom: unknown): boolean {
  const first = Array.isArray(rawFrom) ? rawFrom[0] : rawFrom;
  const key = cleanCampaign(first);
  if (!key) return false;
  return CASE_APPLY_FIRST_KEYS.includes(key);
}

/**
 * 紙から来た人の、いちばん上に出す2行。
 *
 * **どちらも紙に刷ってある文そのもの**です（lib/keiri/card.ts が唯一の正）。
 * 手に持っている紙と画面の1行目がそろうので、読み取った人が
 * 「同じものだ」と確かめられます。新しい約束は1つも入っていません。
 */
export const CASE_CARD_TOP = {
  /** 紙のいちばん上の1行（誰に向けた紙か） */
  audience: CARD_AUDIENCE,
  /** 紙の「誰がやるか」の1行 */
  subline: CARD_SUBLINE,
} as const;
