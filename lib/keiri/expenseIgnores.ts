/**
 * 「同じ支払いが2か所にある」ときに、どちらを数えるかを決めて残すための、ただ1か所の道具（kp230・f1-5）。
 *
 * ■ 何が起きているか（やさしい説明）
 *   手羽屋の記録には、同じ支払いが**2か所に書かれていることがあります**。
 *   日報の「レジから払った経費」と、立て替えの台帳の両方です。
 *   両方そのまま数えると、**その月にかかったお金が多く出ます**
 *   （9月の実データでは、同じ月の中で 90,571円・月をまたいで 385,000円）。
 *
 *   2026-10-03 から、経理の画面はこの疑いを**出す**ようにしました。
 *   ただし出るだけで**片付ける道が無く**、毎月 同じ疑いを見続けることになっていました。
 *
 * ■ この道具がやること
 *   「こちらは数えない」という**印**を1つ置けるようにします。
 *   ・**元の行は消しません・書き換えません。** 日報の行も立替の行もそのまま残ります
 *   ・印は**いつでも元に戻せます**（戻した日時を入れるだけ。印そのものも消しません）
 *   ・印が付いた行は、画面に「同じ支払いなので数えていません」と出します（黙って減らさない）
 *   ・「別々の支払いなので両方数える」も選べます（家賃のように毎月ある支払いのため）
 *
 * ■ 置き場（棚）がまだ無いあいだも壊れません
 *   印を置く棚（`keiri_expense_ignores`）は、倉庫の貼り紙（/keiri/sql の②）を
 *   1回 流すと出来ます。まだ流れていないあいだは、
 *   **今までどおり「疑いを出すだけ」**にして、選ぶボタンは「準備中です」と出します。
 *   ＝ 流す前でも後でも壊れず、流した瞬間から使えます（アプリを出し直す必要はありません）。
 *   これは金庫の記録（keiri_cash_events）・シフトの印（lib/shiftScope.ts）で
 *   先にうまくいった形と同じ考え方です。
 *
 * ■ 金額はこちらで作りません
 *   どちらを数えるかは**人が決めます**。この道具は決めた結果を覚えて、
 *   合計から外すだけです（CLAUDE.md 4-12・5-4b と同じ考え方）。
 */

import type { KeiriAdvance, KeiriReport } from "./types";
import { amountOf, expenseItemsOf } from "./classify";

/* ------------------------------------------------------------------ *
 *  棚の行の形
 * ------------------------------------------------------------------ */

/**
 * 印が指す「どの入り口の記録か」。
 *   report        … 日報の「レジから払った経費」の1行
 *   advance_owner … 経営側の立替（advance_expenses・/cash/advances）
 *   advance_field … 現場の立替（keiri_advance_expenses・/keiri/advances）
 */
export type IgnoreSource = "report" | "advance_owner" | "advance_field";

/** 棚（keiri_expense_ignores）の1行 */
export type ExpenseIgnoreRow = {
  id?: number | string | null;
  source?: string | null;
  ref_id?: string | number | null;
  /** 日報の経費の何行目か（0から数える）。日報以外は空 */
  line_index?: number | null;
  amount?: number | null;
  paid_on?: string | null;
  reason?: string | null;
  /** 戻した日時。空＝いま「数えない」が効いている */
  undone_at?: string | null;
};

/** 印の理由に書く言葉。★この2つだけが「決めた」印として読まれる */
export const IGNORE_REASON = "同じ支払いなので数えない";
export const BOTH_COUNT_REASON = "別々の支払いとして両方数える";

/**
 * 1つの行を指す合言葉。`どの入り口｜元の行の番号｜何行目`。
 * ★番号が無い行（まだ番号を読めていない）は印を付けられないので空を返す。
 */
export function ignoreKey(
  source: IgnoreSource,
  refId: string | number | null | undefined,
  lineIndex?: number | null,
): string {
  const ref = String(refId ?? "").trim();
  if (!ref) return "";
  return `${source}|${ref}|${lineIndex ?? -1}`;
}

/** 立替の入り口（field／owner）を、棚の言い方に直す */
export function advanceIgnoreSource(a: Pick<KeiriAdvance, "source">): IgnoreSource {
  return a.source === "owner" ? "advance_owner" : "advance_field";
}

/* ------------------------------------------------------------------ *
 *  棚の行 → いま効いている印
 * ------------------------------------------------------------------ */

export type IgnoreMarks = {
  /** いま「数えない」が効いている行の合言葉 */
  ignored: Set<string>;
  /** 「別々の支払いとして両方数える」と決めた行の合言葉（数えるが、疑いとしては片付いている） */
  bothCounted: Set<string>;
};

export function emptyIgnoreMarks(): IgnoreMarks {
  return { ignored: new Set<string>(), bothCounted: new Set<string>() };
}

/**
 * 棚の行から「いま効いている印」を作る（計算だけ・通信しない）。
 *
 * ★戻した印（undone_at が入っている行）は**数えない印としては効きません**。
 *   ただし理由が「別々の支払いとして両方数える」の行だけは、
 *   **人が確かめて両方数えると決めた**という記録として読みます
 *   （この棚は「数えない」印しか置けないので、効かせない形で決めごとを残します）。
 */
export function readIgnoreMarks(rows: readonly ExpenseIgnoreRow[] | null | undefined): IgnoreMarks {
  const marks = emptyIgnoreMarks();
  for (const row of rows ?? []) {
    const source = String(row.source ?? "") as IgnoreSource;
    if (source !== "report" && source !== "advance_owner" && source !== "advance_field") continue;
    const key = ignoreKey(source, row.ref_id, row.line_index ?? null);
    if (!key) continue;
    const live = !String(row.undone_at ?? "").trim();
    if (live) {
      marks.ignored.add(key);
      // 「数えない」が効いているほうが強い（両方数える、とは同時に言えない）
      marks.bothCounted.delete(key);
      continue;
    }
    if (String(row.reason ?? "").trim() === BOTH_COUNT_REASON && !marks.ignored.has(key)) {
      marks.bothCounted.add(key);
    }
  }
  return marks;
}

/** その行は「数えない」ことになっているか */
export function isIgnored(marks: IgnoreMarks, key: string): boolean {
  return !!key && marks.ignored.has(key);
}

/** その組は「別々の支払いなので両方数える」と決まっているか */
export function isBothCounted(marks: IgnoreMarks, key: string): boolean {
  return !!key && marks.bothCounted.has(key);
}

/* ------------------------------------------------------------------ *
 *  棚があるか（貼り紙が流れたか）
 * ------------------------------------------------------------------ */

/**
 * 棚の様子。
 *   ready   … ある（選べる）
 *   missing … まだ無い（貼り紙②が流れていない。今までどおり「出すだけ」）
 *   unknown … 確かめられなかった（＝今までどおりに倒す。勝手に数字を動かさない）
 */
export type IgnoreShelfState = "ready" | "missing" | "unknown";

export function ignoreShelfStateOf(
  probe: { error?: { code?: string | null; message?: string | null } | null } | null | undefined,
): IgnoreShelfState {
  if (!probe) return "unknown";
  const error = probe.error ?? null;
  if (!error) return "ready";
  const code = String(error.code ?? "").trim();
  const message = String(error.message ?? "");
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist|could not find the table|schema cache/i.test(message)
  ) {
    return "missing";
  }
  return "unknown";
}

/** 選べる状態か（ready だけが true） */
export function canMarkIgnores(state: IgnoreShelfState): boolean {
  return state === "ready";
}

/* ------------------------------------------------------------------ *
 *  画面に出す言葉（司令室 meta/keiri-material-kasanari-kotoba・B2 の材料のまま）
 * ------------------------------------------------------------------ */

export const IGNORE_WORDS = {
  lead:
    "日報と立て替えの記録の両方に、同じ日・同じ金額の支払いがあります。両方数えると、" +
    "かかったお金が多く出ます。どちらか片方だけ数えるように選んでください。記録は消えません。",
  chooseReport: "日報のほうだけ数える",
  chooseAdvance: "立て替えのほうだけ数える",
  chooseBoth: "別々の支払いなので、両方数える",
  ignoredReport: "日報の記録は、同じ支払いなので数えていません（記録は残っています）",
  ignoredAdvance: "立て替えの記録は、同じ支払いなので数えていません（記録は残っています）",
  bothCounted: "別々の支払いとして両方数えています",
  undo: "元に戻す",
  crossMonth:
    "前の月にも同じ金額の支払いがあります。毎月の支払い（家賃など）なら" +
    "『別々の支払い』を選んでください。",
  allClear: "同じ支払いの疑いはありません。",
  hint: "レシートが1枚しか無ければ、同じ支払いです。レシートが2枚あれば、別々の支払いです。",
  notReady:
    "どちらを数えるかを選んで残しておく置き場が、まだ準備中です。" +
    "準備ができたら、このままここで選べるようになります（記録は消えません）。",
} as const;

/* ------------------------------------------------------------------ *
 *  数えない印を、月の集計に効かせる
 * ------------------------------------------------------------------ */

/** 数えなかった1行（画面に理由つきで出すため。黙って減らさない） */
export type IgnoredExpense = {
  source: IgnoreSource;
  date: string;
  description: string;
  amount: number;
};

/**
 * 日報の経費の1行が「数えない」ことになっているか。
 * ★何行目かは `expenseItemsOf` で開いた順（0から）で数えます。
 */
export function reportLineIgnored(
  marks: IgnoreMarks,
  report: Pick<KeiriReport, "id">,
  lineIndex: number,
): boolean {
  return isIgnored(marks, ignoreKey("report", report.id ?? null, lineIndex));
}

/** 立替の1件が「数えない」ことになっているか */
export function advanceIgnored(marks: IgnoreMarks, advance: KeiriAdvance): boolean {
  return isIgnored(marks, ignoreKey(advanceIgnoreSource(advance), advance.id ?? null, null));
}

/** 数えなかった行の一覧（画面に出すため）。合計は呼んだ側で足す */
export function listIgnoredExpenses(params: {
  ym: string;
  reports: readonly KeiriReport[];
  advances: readonly KeiriAdvance[];
  marks: IgnoreMarks;
}): IgnoredExpense[] {
  const { ym, reports, advances, marks } = params;
  const out: IgnoredExpense[] = [];
  for (const r of reports) {
    if (!String(r.date ?? "").startsWith(ym)) continue;
    expenseItemsOf(r.expenses).forEach((item, i) => {
      if (!reportLineIgnored(marks, r, i)) return;
      out.push({
        source: "report",
        date: r.date,
        description: String(item.description ?? "").trim() || "（説明なし）",
        amount: amountOf(item),
      });
    });
  }
  for (const a of advances) {
    if (!String(a.date ?? "").startsWith(ym)) continue;
    if (!advanceIgnored(marks, a)) continue;
    out.push({
      source: advanceIgnoreSource(a),
      date: a.date,
      description: String(a.description ?? "").trim() || "（説明なし）",
      amount: Number(a.amount) || 0,
    });
  }
  out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return out;
}

/* ------------------------------------------------------------------ *
 *  疑いの1組について、人が決めたかどうか
 * ------------------------------------------------------------------ */

/** 疑いの1組が、いまどうなっているか */
export type SuspectDecision =
  /** まだ決めていない（両方そのまま数えている＝経費が多く出ているおそれ） */
  | "pending"
  /** 日報のほうを数えない（立て替えのほうだけ数える） */
  | "report-ignored"
  /** 立て替えのほうを数えない（日報のほうだけ数える） */
  | "advance-ignored"
  /** 別々の支払いなので両方数える（人が確かめて決めた） */
  | "both";

/** 疑いの1組を指す、2つの合言葉（印を付ける先） */
export function suspectKeys(suspect: {
  report: { id?: string | number | null; lineIndex: number };
  advance: { id?: string | number | null; source?: "field" | "owner" };
}): { report: string; advance: string } {
  return {
    report: ignoreKey("report", suspect.report.id ?? null, suspect.report.lineIndex),
    advance: ignoreKey(
      advanceIgnoreSource({ source: suspect.advance.source }),
      suspect.advance.id ?? null,
      null,
    ),
  };
}

/** その組は、いまどうなっているか（印から読むだけ） */
export function suspectDecision(
  suspect: Parameters<typeof suspectKeys>[0],
  marks: IgnoreMarks,
): SuspectDecision {
  const keys = suspectKeys(suspect);
  if (isIgnored(marks, keys.report)) return "report-ignored";
  if (isIgnored(marks, keys.advance)) return "advance-ignored";
  if (isBothCounted(marks, keys.report) || isBothCounted(marks, keys.advance)) return "both";
  return "pending";
}

/** まだ決めていない組だけを残す（決めた組は「確かめてほしいこと」から外れる） */
export function pendingSuspects<T extends Parameters<typeof suspectKeys>[0] & { amount: number; sameMonth: boolean }>(
  suspects: readonly T[],
  marks: IgnoreMarks,
): { suspects: T[]; doubleCountedTotal: number; crossMonthTotal: number } {
  const rest = suspects.filter((s) => suspectDecision(s, marks) === "pending");
  return {
    suspects: rest,
    doubleCountedTotal: rest.filter((s) => s.sameMonth).reduce((t, s) => t + s.amount, 0),
    crossMonthTotal: rest.filter((s) => !s.sameMonth).reduce((t, s) => t + s.amount, 0),
  };
}

/* ------------------------------------------------------------------ *
 *  棚に書く中身（通信はここではしない。形を決めるだけ）
 * ------------------------------------------------------------------ */

/** 人が押せる3つの選び方（＝どちらを**数える**か） */
export type IgnoreChoice =
  /** 日報のほうだけ数える（立て替えの記録を数えない） */
  | "count-report"
  /** 立て替えのほうだけ数える（日報の記録を数えない） */
  | "count-advance"
  /** 別々の支払いなので、両方数える */
  | "both";

/** 棚（keiri_expense_ignores）に足す1行の中身 */
export type IgnoreWrite = {
  source: IgnoreSource;
  ref_id: string;
  line_index: number | null;
  amount: number;
  paid_on: string | null;
  reason: string;
  /** 空＝「数えない」が効く／日時入り＝効かせない（決めごとの記録として残すだけ） */
  undone_at: string | null;
};

/** 「元に戻す」で消す印の指し先（この形で棚を探して undone_at を入れる） */
export type IgnoreTarget = {
  source: IgnoreSource;
  ref_id: string;
  line_index: number | null;
};

export function suspectTargets(suspect: {
  amount: number;
  report: { date: string; id?: string | number | null; lineIndex: number };
  advance: { date: string; id?: string | number | null; source?: "field" | "owner" };
}): { report: IgnoreTarget | null; advance: IgnoreTarget | null } {
  const reportRef = String(suspect.report.id ?? "").trim();
  const advanceRef = String(suspect.advance.id ?? "").trim();
  return {
    report: reportRef
      ? { source: "report", ref_id: reportRef, line_index: suspect.report.lineIndex }
      : null,
    advance: advanceRef
      ? {
          source: advanceIgnoreSource({ source: suspect.advance.source }),
          ref_id: advanceRef,
          line_index: null,
        }
      : null,
  };
}

/**
 * 選んだ結果を棚に書く中身にする（純粋な計算）。
 *
 * ★「別々の支払いなので両方数える」は、**効かせない行**（undone_at 入り）で残します。
 *   この棚は「数えない」印しか置けないので、効かせずに決めごとだけを残す形です。
 *   こうしておくと、同じ組が毎月「確かめてほしいこと」に出続けません。
 * ★元の行（日報・立替）は1文字も書き換えません。
 */
export function writesForChoice(
  suspect: Parameters<typeof suspectTargets>[0],
  choice: IgnoreChoice,
  now: Date = new Date(),
): IgnoreWrite[] {
  const t = suspectTargets(suspect);
  const stamp = now.toISOString();
  if (choice === "count-report") {
    if (!t.advance) return [];
    return [
      {
        ...t.advance,
        amount: suspect.amount,
        paid_on: suspect.advance.date || null,
        reason: IGNORE_REASON,
        undone_at: null,
      },
    ];
  }
  if (choice === "count-advance") {
    if (!t.report) return [];
    return [
      {
        ...t.report,
        amount: suspect.amount,
        paid_on: suspect.report.date || null,
        reason: IGNORE_REASON,
        undone_at: null,
      },
    ];
  }
  // 両方数える＝効かせない行を1つ残すだけ（日報の側に付ける）
  const target = t.report ?? t.advance;
  if (!target) return [];
  return [
    {
      ...target,
      amount: suspect.amount,
      paid_on: (target.source === "report" ? suspect.report.date : suspect.advance.date) || null,
      reason: BOTH_COUNT_REASON,
      undone_at: stamp,
    },
  ];
}

/** 印を付けられるか（元の行の番号が読めているか）。番号が無いと付けられない */
export function canChoose(suspect: Parameters<typeof suspectTargets>[0]): boolean {
  const t = suspectTargets(suspect);
  return !!t.report && !!t.advance;
}

/** 「両方数える」を元に戻すときに、理由に足す言葉（消さずに効かなくする） */
export const BOTH_COUNT_UNDONE_REASON = `${BOTH_COUNT_REASON}（元に戻しました）`;
