/**
 * 「同じ日報が2枚あるときに、どちらを数えるか」決めた印を、
 * **置き場（棚）ができるまでのあいだ**、経理の設定の行（keiri_settings.memo）に
 * 控えておくところ（2026-11-03・kp246・f1-5）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜこうするのか（やさしい説明）
 *   印を置く専用の棚を倉庫に足すには、貼り紙（SQL）を1回 流す必要があります。
 *   その貼り紙は 27日 動いていません。待っているあいだ押せないままだと、
 *   10月の「同じ日報が2枚」の2組を**決められません**＝月の売上がずっと二重のままです。
 *
 *   経理の設定の行は、もうある棚で、ブラウザから書き換えられます。
 *   金庫を数えた1回（lib/keiri/cashCountMemo.ts）と、
 *   同じ支払いの二重（lib/keiri/expenseIgnoreMemo.ts）で先にうまくいった形と
 *   **まったく同じ考え方**で、決めた印をこの行のおまけ欄（memo）に控えます。
 *
 * ■ 守ること
 *   ・**いま memo に書いてある文は消しません。** 控えは挟み込みの印の中だけに書き、
 *     印ごと外せば元の文がそのまま戻ります（＝1行で元に戻せる）。
 *   ・**ほかの2つの控えとは印がちがいます。** お互いの印の外は1文字も触らないので、
 *     3つが同じ欄に並んで入っていても壊れません。
 *   ・読めない行は**読み飛ばします**。そのときその組は「まだ決めていない」に戻って
 *     また画面に出ます（＝黙って売上が減る側には倒れません）。
 *   ・手羽屋の日報・シフト・レジ・LINE・お金の計算（lib/money.ts）には触りません。
 */

import {
  SAME_REPORT_BOTH_REASON,
  SAME_REPORT_BOTH_UNDONE_REASON,
  type ReportDupRow,
} from "./reportDups";

/** 控えの始まりの印 */
export const SAME_REPORT_MEMO_BEGIN = "［同じ日報の控え v1 ここから］";
/** 控えの終わりの印 */
export const SAME_REPORT_MEMO_END = "［同じ日報の控え v1 ここまで］";

/** 控えの中に書く、人が読んでも分かる1行の説明 */
const SAME_REPORT_MEMO_NOTE =
  "※ 同じ日報が2枚 入っているときに、どちらを数えるかを決めた控えです。" +
  "この印から印までを消すと、元のひとことだけが残ります。日報は1行も消していません。";

/** 控えに置ける印の数の上限 */
export const SAME_REPORT_MEMO_MAX_ROWS = 200;
/** 控え全体の長さの上限（文字数） */
export const SAME_REPORT_MEMO_MAX_CHARS = 60000;

/** 控えに文字として置くときの、印1件の形 */
type MemoRow = {
  group: string;
  ref_ids: string[];
  sales: number;
  happened_on: string | null;
  reason: string;
  undone_at: string | null;
};

/** 読める形の印だけを通す（おかしな値は null＝読み飛ばす） */
function normalize(raw: unknown): MemoRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const group = String(r.group ?? "").trim();
  if (!group) return null;
  if (!Array.isArray(r.ref_ids)) return null;
  const refIds: string[] = [];
  for (const v of r.ref_ids) {
    const t = String(v ?? "").trim();
    if (!t) return null;
    refIds.push(t);
  }
  if (refIds.length === 0) return null;
  const sales = Number(r.sales);
  if (!Number.isFinite(sales) || sales < 0) return null;
  const happenedOn =
    r.happened_on === null || r.happened_on === undefined || String(r.happened_on).trim() === ""
      ? null
      : String(r.happened_on).slice(0, 10);
  if (happenedOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(happenedOn)) return null;
  const reason = String(r.reason ?? "").trim();
  if (!reason) return null;
  const undoneAt =
    r.undone_at === null || r.undone_at === undefined || String(r.undone_at).trim() === ""
      ? null
      : String(r.undone_at);
  return {
    group,
    ref_ids: refIds,
    sales: Math.round(sales),
    happened_on: happenedOn,
    reason,
    undone_at: undoneAt,
  };
}

/** 挟み込みの印の中を取り除いて、元の文だけを返す */
export function stripReportDupMemo(memo: string | null | undefined): string {
  const text = String(memo ?? "");
  const begin = text.indexOf(SAME_REPORT_MEMO_BEGIN);
  if (begin < 0) return text.trim();
  const endAt = text.indexOf(SAME_REPORT_MEMO_END, begin);
  const after = endAt < 0 ? "" : text.slice(endAt + SAME_REPORT_MEMO_END.length);
  return `${text.slice(0, begin)}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * memo に控えてある印を読む。
 * ★印が無い・中身がおかしい ときは **空**（＝今までどおり印なし扱い）。
 */
export function decodeReportDupMemo(memo: string | null | undefined): ReportDupRow[] {
  const text = String(memo ?? "");
  const begin = text.indexOf(SAME_REPORT_MEMO_BEGIN);
  if (begin < 0) return [];
  const endAt = text.indexOf(SAME_REPORT_MEMO_END, begin);
  const inner = text.slice(begin + SAME_REPORT_MEMO_BEGIN.length, endAt < 0 ? undefined : endAt);
  const out: ReportDupRow[] = [];
  for (const line of inner.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(t);
    } catch {
      continue;
    }
    const row = normalize(parsed);
    if (!row) continue;
    out.push(row);
    if (out.length >= SAME_REPORT_MEMO_MAX_ROWS) break;
  }
  return out;
}

/**
 * 控えの中身を memo の文にする。
 * ★いま書いてある文はそのまま残し、前の控えだけ入れ替えます。
 * ★印が0件なら、挟み込みごと外した文を返します（空の控えを残さない）。
 * ★上限を超えるときは null（＝控えない。黙って切り捨てない）。
 */
export function encodeReportDupMemo(
  memo: string | null | undefined,
  rows: readonly ReportDupRow[],
): string | null {
  const base = stripReportDupMemo(memo);
  const normalized: MemoRow[] = [];
  for (const row of rows) {
    const n = normalize(row);
    if (!n) return null;
    normalized.push(n);
  }
  if (normalized.length > SAME_REPORT_MEMO_MAX_ROWS) return null;
  if (normalized.length === 0) return base;
  const block = [
    SAME_REPORT_MEMO_BEGIN,
    SAME_REPORT_MEMO_NOTE,
    ...normalized.map((r) => JSON.stringify(r)),
    SAME_REPORT_MEMO_END,
  ].join("\n");
  const next = base === "" ? block : `${base}\n\n${block}`;
  if (next.length > SAME_REPORT_MEMO_MAX_CHARS) return null;
  return next;
}

/**
 * 押して決めた印を控えに足した memo の文を作る。
 * ★同じ組を指す前の印は**入れ替えます**（押し直せるように）。
 * ★作れないときは null（＝控えない。「残しました」と言わせないため）。
 */
export function addReportDupToMemo(
  memo: string | null | undefined,
  row: ReportDupRow | null,
): string | null {
  if (!row) return null;
  const incoming = normalize(row);
  if (!incoming) return null;
  const kept = decodeReportDupMemo(memo).filter(
    (r) => String(r.group ?? "").trim() !== incoming.group,
  );
  return encodeReportDupMemo(memo, [...kept, incoming]);
}

/**
 * 「元に戻す」を控えの中で行う。**印は消さず、効かなくするだけ**。
 *   ・「数えない」が効いている印 … 戻した日時を入れる
 *   ・「両方数える」の印 … 理由に（元に戻しました）を足す
 *
 * @returns changed＝直した印の数。0 なら「戻しました」と言わない（嘘を出さないため）
 */
export function undoReportDupInMemo(
  memo: string | null | undefined,
  group: string,
  now: Date = new Date(),
): { memo: string | null; changed: number } {
  const want = String(group ?? "").trim();
  if (!want) return { memo: null, changed: 0 };
  const rows = decodeReportDupMemo(memo);
  let changed = 0;
  const next = rows.map((row) => {
    if (String(row.group ?? "").trim() !== want) return row;
    const live = !String(row.undone_at ?? "").trim();
    if (live) {
      changed += 1;
      return { ...row, undone_at: now.toISOString() };
    }
    if (String(row.reason ?? "").trim() === SAME_REPORT_BOTH_REASON) {
      changed += 1;
      return { ...row, reason: SAME_REPORT_BOTH_UNDONE_REASON };
    }
    return row;
  });
  if (changed === 0) return { memo: null, changed: 0 };
  return { memo: encodeReportDupMemo(memo, next), changed };
}
