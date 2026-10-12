/**
 * 「じゅんだけの手続きが のこっています」の知らせ（2026-10-12・f1-4／f3-4／f5-4）の、
 * 計算だけのファイル。
 *
 * ■ なぜ要るか（やさしい説明）
 *   仕上げに のこっている3つ（金庫が合うか・お店ごとに分ける・2軒目を通す）は、
 *   どれも **じゅんが1回だけやる手続き**で止まっています。
 *   その手続きの一覧は 経理の画面（/keiri）のいちばん上に出していますが、
 *   じゅんが毎日ひらくのは **手羽屋のホームと管理者ページ**です。
 *   ＝ お願いは出ているのに、じゅんが見る所には出ていませんでした。
 *   貼り紙（2分）は 10/3 から **10日** 止まったままです。
 *
 *   そこで、すでにある知らせ（お申し込みの赤い知らせ・kp156）と
 *   **まったく同じ形**で、ホームと管理者ページのいちばん上に出します。
 *   答えは 窓口（/api/keiri/setuptodo）が返すものをそのまま並べるだけで、
 *   こちらでは1つも作りません。
 *
 * ■ 誰に出るか
 *   管理者パスワードを一度でも入れた端末（＝じゅんの端末）だけ。
 *   手羽屋のスタッフの端末には、最初から最後まで出ません
 *   （印が無ければ、窓口に聞きにも行きません）。
 *
 * ■ 出さないもの（大事）
 *   鍵・合言葉・金額・お店の名前は1文字も出しません。
 *   窓口がそれらを返してこないので、出しようがありません。
 *   出すのは「のこり何件・何分・どの1枚をひらくか」だけです。
 *
 * ■ 分からないときは出しません
 *   窓口が読めなかった・形が違ったときは、何も出しません
 *   （「0件」と「分からない」を取り違えて、嘘の安心を出さないため）。
 *
 * ■ 手羽屋の日報・シフト・レジ・LINE には一切触れていません。
 */

/** 窓口（/api/keiri/setuptodo）から受け取る1件ぶん。中身は出さない物しか持ちません */
export type SetupNoticeItem = {
  id: string;
  order: number;
  title: string;
  minutes: string;
  benefit: string;
  href: string;
  /** "のこり" | "済み" | "分からない" */
  state: string;
  detail: string;
};

/** 窓口の返事を、画面が使える形にしたもの */
export type SetupNoticeSummary = {
  /** 読めたか（形が違えば false＝何も出さない） */
  readable: boolean;
  /** のこっている件数（「分からない」は数えない） */
  remaining: number;
  items: SetupNoticeItem[];
  /** 窓口が作った1行のまとめ（あればそのまま使う） */
  summary: string | null;
};

const REMAINING = "のこり";

/** 窓口の返事を読む。読めない中身は readable:false にする（推測で埋めない） */
export function readSetupTodoSummary(raw: unknown): SetupNoticeSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;

  const items: SetupNoticeItem[] = [];
  for (const row of o.items) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const id = str(r.id);
    const title = str(r.title);
    const state = str(r.state);
    if (!id || !title || !state) continue;
    items.push({
      id,
      order: typeof r.order === "number" && Number.isFinite(r.order) ? r.order : 99,
      title,
      minutes: str(r.minutes),
      benefit: str(r.benefit),
      href: str(r.href),
      state,
      detail: str(r.detail),
    });
  }
  if (items.length === 0) return null;

  const counted = items.filter((i) => i.state === REMAINING).length;
  const remaining =
    typeof o.remaining === "number" && Number.isFinite(o.remaining) ? o.remaining : counted;

  return {
    readable: true,
    remaining,
    items,
    summary: typeof o.summary === "string" && o.summary ? o.summary : null,
  };
}

/**
 * 知らせを出すか。
 * 出すのは「じゅんの端末」「読めた」「のこりが1件以上ある」の3つが揃うときだけ。
 */
export function shouldShowSetupNotice(input: {
  ownerDevice: boolean;
  summary: SetupNoticeSummary | null;
}): boolean {
  if (!input.ownerDevice) return false;
  const s = input.summary;
  if (!s || !s.readable) return false;
  return s.remaining > 0;
}

/** のこっている手続きだけを、やってほしい順に並べる */
export function remainingItems(summary: SetupNoticeSummary | null): SetupNoticeItem[] {
  if (!summary) return [];
  return summary.items
    .filter((i) => i.state === REMAINING)
    .sort((a, b) => a.order - b.order);
}

/** のこっている手続きの合計の分数（「2分」のような書き方から数字だけを足す） */
export function remainingMinutes(summary: SetupNoticeSummary | null): number {
  return remainingItems(summary).reduce(
    (sum, i) => sum + (Number(i.minutes.replace(/[^\d]/g, "")) || 0),
    0,
  );
}

/**
 * 知らせの見出し。
 * 窓口が1行のまとめを返していればそれを使い（2か所で違うことを言わないため）、
 * 無ければ件数と分数から作る。
 */
export function setupNoticeHeadline(summary: SetupNoticeSummary | null): string {
  if (summary?.summary) return summary.summary;
  const remaining = summary?.remaining ?? 0;
  const minutes = remainingMinutes(summary);
  return minutes > 0
    ? `のこりの手続きは ${remaining} 件です（合わせて ${minutes}分ほど）`
    : `のこりの手続きは ${remaining} 件です`;
}

/** 下に添える1行（ここに鍵・金額・お店の名前は書かない） */
export const SETUP_NOTICE_NOTE =
  "この3つは じゅんだけができる一度きりの手続きです。上から順に押すだけで終わります（スタッフの画面には出ません）。";
