/**
 * 「同じ支払いなので こちらは数えない」と決めた印を、**置き場（keiri_expense_ignores）が
 * できるまでのあいだ**、経理の設定の行（keiri_settings.memo）に控えておくところ。
 * **計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（2026-10-22・kp230・f1-5）
 *   9月の実データには「同じ支払いが2か所にある疑い」が **29件** 残っています。
 *   押して片付ける道（kp230 の①②③）は 10/9 からできているのに、
 *   **印を置く棚が倉庫に無い**ので、押すボタンそのものを出せませんでした。
 *   棚は倉庫に貼り紙を1回 貼ると できますが、そこが 19日 動いていません。
 *   ＝ **決めること自体ができない**ので、店主に見せるページの9月の利益も出せません。
 *
 *   経理の設定の行は、もうある棚で、ブラウザから書き換えられます。
 *   金庫を数えた1回で先にうまくいった形（lib/keiri/cashCountMemo.ts）と
 *   **まったく同じ考え方**で、決めた印をこの行のおまけ欄（memo）に控えます。
 *   こうすると **貼り紙を待たずに決められます**。
 *
 * ■ 守ること（金庫の控えと同じ）
 *   ・**金額は作らない。** どちらを数えるかは**人が決めます**（CLAUDE.md 4-12・5-4b）。
 *     この道具は決めた結果を覚えるだけで、金額を1円も直しません。
 *   ・**いま memo に書いてある文は消さない。** 控えは挟み込みの印の中だけに書き、
 *     印ごと外せば元の文がそのまま戻る（＝1行で元に戻せる）。
 *   ・**金庫の控え（lib/keiri/cashCountMemo.ts）と同じ欄を使うが、印がちがう。**
 *     お互いの印の外は1文字も触らないので、2つが同じ欄に並んで入っていても壊れません。
 *   ・**棚ができたあとは棚のほうが正。** 同じ行を指す印が両方にあるときは棚を使い、
 *     棚に無い印だけ控えから読む（＝貼り紙より前に決めた分が消えない）。
 *   ・読めない行は**読み飛ばす**。そのときその組は「まだ決めていない」に戻って
 *     また画面に出ます（＝黙って経費が減る側には倒れません）。
 *   ・手羽屋の日報・シフト・レジ・LINE・お金の計算（lib/money.ts）には触りません。
 */

import {
  BOTH_COUNT_REASON,
  BOTH_COUNT_UNDONE_REASON,
  ignoreKey,
  type ExpenseIgnoreRow,
  type IgnoreShelfState,
  type IgnoreSource,
  type IgnoreTarget,
  type IgnoreWrite,
} from "./expenseIgnores";

/** 控えの始まりの印 */
export const IGNORE_MEMO_BEGIN = "［数えない印の控え v1 ここから］";
/** 控えの終わりの印 */
export const IGNORE_MEMO_END = "［数えない印の控え v1 ここまで］";

/** 控えの中に書く、人が読んでも分かる1行の説明 */
const IGNORE_MEMO_NOTE =
  "※ 置き場（keiri_expense_ignores）ができるまでの仮置きです。" +
  "この印から印までを消すと、元のひとことだけが残ります。金額は1円も計算していません。";

/** 控えに置ける印の数の上限（おまけ欄を長くしないため） */
export const IGNORE_MEMO_MAX_ROWS = 200;
/** 控え全体の長さの上限（文字数） */
export const IGNORE_MEMO_MAX_CHARS = 60000;

/** 控えに文字として置くときの、印1件の形 */
type MemoIgnore = {
  source: IgnoreSource;
  ref_id: string;
  line_index: number | null;
  amount: number;
  paid_on: string | null;
  reason: string;
  undone_at: string | null;
};

const SOURCES: IgnoreSource[] = ["report", "advance_owner", "advance_field"];

/** その印が指している行の合言葉（`どの入り口｜元の行の番号｜何行目`） */
export function ignoreRowKey(
  row: Pick<ExpenseIgnoreRow, "source" | "ref_id" | "line_index">,
): string {
  const source = String(row.source ?? "") as IgnoreSource;
  if (!SOURCES.includes(source)) return "";
  return ignoreKey(source, row.ref_id, row.line_index ?? null);
}

/** 読める形の印だけを通す（おかしな値は null＝読み飛ばす） */
function normalizeMemoIgnore(raw: unknown): MemoIgnore | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const source = String(r.source ?? "") as IgnoreSource;
  if (!SOURCES.includes(source)) return null;
  const refId = String(r.ref_id ?? "").trim();
  if (!refId) return null;
  const lineRaw = r.line_index;
  let lineIndex: number | null = null;
  if (lineRaw !== null && lineRaw !== undefined) {
    const n = Number(lineRaw);
    if (!Number.isInteger(n) || n < 0) return null;
    lineIndex = n;
  }
  const amount = Number(r.amount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const paidOn = r.paid_on === null || r.paid_on === undefined ? null : String(r.paid_on).slice(0, 10);
  if (paidOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return null;
  const reason = String(r.reason ?? "").trim();
  if (!reason) return null;
  const undoneAt =
    r.undone_at === null || r.undone_at === undefined || String(r.undone_at).trim() === ""
      ? null
      : String(r.undone_at);
  return {
    source,
    ref_id: refId,
    line_index: lineIndex,
    amount: Math.round(amount),
    paid_on: paidOn,
    reason,
    undone_at: undoneAt,
  };
}

/** 挟み込みの印の中を取り除いて、元の文だけを返す */
export function stripExpenseIgnoreMemo(memo: string | null | undefined): string {
  const text = String(memo ?? "");
  const begin = text.indexOf(IGNORE_MEMO_BEGIN);
  if (begin < 0) return text.trim();
  const endAt = text.indexOf(IGNORE_MEMO_END, begin);
  const after = endAt < 0 ? "" : text.slice(endAt + IGNORE_MEMO_END.length);
  return `${text.slice(0, begin)}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * memo に控えてある印を読む。
 *
 * ★印が無い・中身がおかしい ときは **空**（＝今までどおり印なし扱い）。
 *   1件だけ読めないときはその1件を読み飛ばす（その組は「まだ決めていない」に戻る）。
 */
export function decodeExpenseIgnoreMemo(memo: string | null | undefined): ExpenseIgnoreRow[] {
  const text = String(memo ?? "");
  const begin = text.indexOf(IGNORE_MEMO_BEGIN);
  if (begin < 0) return [];
  const endAt = text.indexOf(IGNORE_MEMO_END, begin);
  const inner = text.slice(begin + IGNORE_MEMO_BEGIN.length, endAt < 0 ? undefined : endAt);
  const out: ExpenseIgnoreRow[] = [];
  for (const line of inner.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(t);
    } catch {
      continue;
    }
    const row = normalizeMemoIgnore(parsed);
    if (!row) continue;
    out.push({ id: null, ...row });
    if (out.length >= IGNORE_MEMO_MAX_ROWS) break;
  }
  return out;
}

/**
 * 控えの中身を memo の文にする。
 *
 * ★いま書いてある文はそのまま残し、前の控えだけ入れ替える。
 * ★印が0件なら、挟み込みごと外した文を返す（空の控えを残さない）。
 * ★上限を超えるときは null（＝控えない。黙って切り捨てない）。
 */
export function encodeExpenseIgnoreMemo(
  memo: string | null | undefined,
  rows: readonly ExpenseIgnoreRow[],
): string | null {
  const base = stripExpenseIgnoreMemo(memo);
  const normalized: MemoIgnore[] = [];
  for (const row of rows) {
    const n = normalizeMemoIgnore(row);
    if (!n) return null;
    normalized.push(n);
  }
  if (normalized.length > IGNORE_MEMO_MAX_ROWS) return null;
  if (normalized.length === 0) return base;
  const block = [
    IGNORE_MEMO_BEGIN,
    IGNORE_MEMO_NOTE,
    ...normalized.map((r) => JSON.stringify(r)),
    IGNORE_MEMO_END,
  ].join("\n");
  const next = base === "" ? block : `${base}\n\n${block}`;
  if (next.length > IGNORE_MEMO_MAX_CHARS) return null;
  return next;
}

/**
 * 棚の印と控えの印を合わせる。
 *
 * ★**棚のほうが正**。同じ行を指す印が両方にあるときは棚だけを使う
 *   （棚で「元に戻した」のに、控えの古い印でまた数えなくなるのを防ぐ）。
 * ★棚に無い行の印だけ控えから足す（貼り紙より前に決めた分が消えない）。
 */
export function mergeIgnoreRows(
  shelfRows: readonly ExpenseIgnoreRow[] | null | undefined,
  memoRows: readonly ExpenseIgnoreRow[] | null | undefined,
): ExpenseIgnoreRow[] {
  const shelf = [...(shelfRows ?? [])];
  const known = new Set<string>();
  for (const row of shelf) {
    const key = ignoreRowKey(row);
    if (key) known.add(key);
  }
  const extra = (memoRows ?? []).filter((row) => {
    const key = ignoreRowKey(row);
    return !!key && !known.has(key);
  });
  return [...shelf, ...extra];
}

/**
 * 押して決めた印を控えに足した memo の文を作る。
 *
 * ★同じ行を指す前の印は**入れ替える**（同じ組を押し直せるように）。
 * ★`alsoRelease` に その組の**もう片方**を渡すと、そちらに効いている印を
 *   **効かなくしてから**足します（印は消しません）。
 *   これが無いと「日報のほうだけ数える」→「立て替えのほうだけ数える」と
 *   押し替えたときに **両方 数えないことになり、経費が二重に減ります**。
 * ★作れないときは null（＝控えない。「残しました」と言わせないため）。
 */
export function addIgnoreWritesToMemo(
  memo: string | null | undefined,
  writes: readonly IgnoreWrite[],
  alsoRelease: readonly (IgnoreTarget | null)[] = [],
  now: Date = new Date(),
): string | null {
  if (writes.length === 0) return null;
  const incoming: ExpenseIgnoreRow[] = [];
  for (const w of writes) {
    const n = normalizeMemoIgnore(w);
    if (!n) return null;
    incoming.push({ id: null, ...n });
  }
  const replacing = new Set(incoming.map((r) => ignoreRowKey(r)).filter(Boolean));
  const release = new Set(
    alsoRelease
      .filter((t): t is IgnoreTarget => !!t)
      .map((t) => ignoreRowKey(t))
      .filter((k) => !!k && !replacing.has(k)),
  );
  const kept = decodeExpenseIgnoreMemo(memo)
    .filter((row) => {
      const key = ignoreRowKey(row);
      return !!key && !replacing.has(key);
    })
    .map((row) => {
      const key = ignoreRowKey(row);
      if (!release.has(key)) return row;
      const live = !String(row.undone_at ?? "").trim();
      if (live) return { ...row, undone_at: now.toISOString() };
      if (String(row.reason ?? "").trim() === BOTH_COUNT_REASON) {
        return { ...row, reason: BOTH_COUNT_UNDONE_REASON };
      }
      return row;
    });
  return encodeExpenseIgnoreMemo(memo, [...kept, ...incoming]);
}

/**
 * 「元に戻す」を控えの中で行う。**印は消さず、効かなくするだけ**（棚と同じ形）。
 *   ・「数えない」が効いている印 … 戻した日時を入れる
 *   ・「別々の支払いとして両方数える」の印 … 理由に（元に戻しました）を足す
 *
 * @returns changed＝直した印の数。0 なら「戻しました」と言わない（嘘を出さないため）
 */
export function undoIgnoresInMemo(
  memo: string | null | undefined,
  targets: readonly (IgnoreTarget | null)[],
  now: Date = new Date(),
): { memo: string | null; changed: number } {
  const wanted = new Set(
    targets
      .filter((t): t is IgnoreTarget => !!t)
      .map((t) => ignoreRowKey(t))
      .filter(Boolean),
  );
  const rows = decodeExpenseIgnoreMemo(memo);
  let changed = 0;
  const next = rows.map((row) => {
    const key = ignoreRowKey(row);
    if (!key || !wanted.has(key)) return row;
    const live = !String(row.undone_at ?? "").trim();
    if (live) {
      changed += 1;
      return { ...row, undone_at: now.toISOString() };
    }
    if (String(row.reason ?? "").trim() === BOTH_COUNT_REASON) {
      changed += 1;
      return { ...row, reason: BOTH_COUNT_UNDONE_REASON };
    }
    return row;
  });
  if (changed === 0) return { memo: null, changed: 0 };
  return { memo: encodeExpenseIgnoreMemo(memo, next), changed };
}

/* ------------------------------------------------------------------ *
 *  どこに印を置くか（棚／控え／置けない）
 * ------------------------------------------------------------------ */

/**
 * 印の置き場。
 *   shelf … 棚（keiri_expense_ignores）がある。今までどおりそこに置く
 *   memo  … 棚はまだ無いが、経理の設定の行がある＝控えに置ける（貼り紙を待たない）
 *   none  … 置けない（棚があるか確かめられない／設定の行が無い）。今までどおり出すだけ
 */
export type IgnoreStore = "shelf" | "memo" | "none";

export function ignoreStoreOf(params: {
  shelf: IgnoreShelfState;
  /** 経理の設定の行が読めたか（控えはこの行のおまけ欄に置くため） */
  settingsRowExists: boolean;
}): IgnoreStore {
  if (params.shelf === "ready") return "shelf";
  if (params.shelf === "missing" && params.settingsRowExists) return "memo";
  return "none";
}
