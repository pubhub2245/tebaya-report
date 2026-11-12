/**
 * 「数えた記録を残す置き場（keiri_cash_events）がまだ無い」ときに、
 * 外から読む窓口（/api/keiri/selfcheck）が返す説明の1行（2026-11-12・B・f1-4）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   11/12 の朝、この1行はこう書いてありました：
 *     「置き場がまだありません。**いまは画面で比べるところまでしかできません**」
 *   これを読んだ側は「じゃあ貼り紙（SQL）を先に貼らないと、金庫を数えても記録が残らない」
 *   と受け取り、じゅんへの頼み文の順番が **貼り紙 → 金庫** になっていました。
 *
 *   ところが実際は違います。置き場が無いあいだは、数えた1回を
 *   **経理の設定の おまけ欄（控え）**に残す道が動いています
 *   （lib/keiri/cashCountPress.ts・2026-10-20／11-01）。
 *   控えは読み返す側（lib/keiri/loadMonthServer.ts が decodeCashCountMemo で
 *   金庫の記録に混ぜる）でも拾われるので、**貼り紙を1枚も貼っていなくても
 *   /api/keiri/cashcount の ok に合否が出ます。**
 *   ＝ 1行が嘘をついていたせいで、じゅんの1分（金庫を数える）が
 *   じゅんの2分（貼り紙）の後ろに並べられていました。
 *
 * ■ 守ること
 *   ・**合否は言わない。**「残せるかどうか」と「貼り紙を待つ必要があるか」だけを言う。
 *   ・金額は1文字も出さない。
 *   ・f1-4 の合否の出どころ（/api/keiri/cashcount の ok）は変えない。
 *
 * ★ 文だけ（倉庫は触りません）。tests/keiriCashShelfNote.test.ts で固定。
 */

/** 置き場があるときの1行 */
export const CASH_SHELF_READY_NOTE =
  "数えた記録を残す置き場があります（数えた1回は、そのまま置き場に1行 残ります）";

/** 置き場がまだ無いときの1行。**貼り紙を待たなくてよい**ことを必ず書く */
export const CASH_SHELF_MISSING_NOTE =
  "数えた記録を残す置き場（keiri_cash_events）はまだありません" +
  "（/keiri/sql の貼り紙①を1回 流すと使えます）。" +
  "**ただし、貼り紙を待つ必要はありません。**" +
  "置き場が無いあいだは、数えた いちばん新しい1回を 経理の設定の おまけ欄に控え、" +
  "こちら側もその控えを読み返します＝" +
  "**いま金庫を1回 数えれば、その場で /api/keiri/cashcount の ok に合否が出ます。**";

/** 置き場の状態（外から読む窓口がそのまま返す言葉） */
export type CashShelfState = "ready" | "missing";

export function cashShelfState(shelfMissing: boolean): CashShelfState {
  return shelfMissing ? "missing" : "ready";
}

/** その状態の説明の1行 */
export function cashShelfNote(shelfMissing: boolean): string {
  return shelfMissing ? CASH_SHELF_MISSING_NOTE : CASH_SHELF_READY_NOTE;
}

/**
 * 金庫を数えるのに、先に貼り紙（SQL）を流す必要があるか。
 * **どちらの道でも false**（控えの道が動いているため）。
 * じゅんへの頼み文の順番を決めるときは、ここだけを見ること。
 */
export function cashCountNeedsSheetFirst(_shelfMissing: boolean): boolean {
  return false;
}
