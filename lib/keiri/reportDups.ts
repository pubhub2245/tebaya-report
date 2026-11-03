/**
 * 「同じ日報が2枚 入っている」ときに、どちらを数えるかを人が決めて残すための、
 * ただ1か所の道具（2026-11-03・kp246・f1-5）。**計算だけ**（倉庫は触りません）。
 *
 * ■ 何が起きているか（やさしい説明）
 *   10月の手羽屋の記録には、**まったく同じ中身の日報が2枚ずつ**入っている日が2日あります
 *   （10/11・10/12。どちらも 10/13 に12分あけて入れ直されたもの）。
 *   両方そのまま数えると、**その月の売上と経費がその分だけ多く出ます**
 *   （売上 45,050円・経費 10,317円）。
 *
 *   2026-11-03 から、月の締めはこの疑いを**出す**ようにしました（lib/keiri/duplicates.ts）。
 *   ただし出るだけで**片付ける道が無く**、毎月 同じ疑いを見続けることになっていました。
 *
 * ■ この道具がやること
 *   1組ごとに、2つのうちどちらかを選んで残せるようにします。
 *     ・［同じ中身なので1枚だけ数える］… 余分な1枚を**数えない**
 *     ・［2枚とも本物（両方数える）］　… そのまま両方数える（同じ日に同じ形で2回 出た等）
 *   どちらも選ばないあいだは「まだ決めていない」で、今までどおり両方数え、
 *   締めは「問題0件」と言いません（＝黙って減らさないし、黙って隠さない）。
 *
 * ■ 守ること（経費と立替の二重＝lib/keiri/expenseIgnores.ts と同じ考え方）
 *   ① **日報そのものは消しません・書き換えません。** 数えないという**印**を1つ置くだけです
 *   ② **金額はこちらで作りません。** どちらを数えるかは**人が決めます**（CLAUDE.md 4-12・5-4b）
 *   ③ 印は**いつでも元に戻せます**（戻した日時を入れるだけ。印そのものも消しません）
 *   ④ 数えなかった行は「同じ日報なので数えていません」と画面に出します（黙って減らさない）
 *   ⑤ 手羽屋の毎日の画面（日報・シフト・レジ・LINE・lib/money.ts）には1行も触りません
 *
 * ■ どちらの1枚を外すか
 *   この疑いに入る2行は、**日・号車・出店先・担当・売上・経費の合計がすべて同じ**行だけです
 *   （lib/keiri/duplicates.ts の findDuplicateReports）。
 *   ＝ どちらを外しても、月の売上・経費・利益は**1円も変わりません**。
 *   そこで並びの**あとの行**（日付→行の番号の順に並べた2枚目以降）を数えないことにします。
 *   外した行の番号は印の中に残るので、あとから見分けられます。
 */

import type { DuplicateReportCheck, DuplicateReportGroup } from "./duplicates";
import type { KeiriReport } from "./types";

/* ------------------------------------------------------------------ *
 *  印の形
 * ------------------------------------------------------------------ */

/** 人が押せる2つの選び方 */
export type ReportDupChoice =
  /** 同じ中身なので1枚だけ数える（余分な1枚を数えない） */
  | "count-once"
  /** 2枚とも本物（両方 数える） */
  | "both";

/** 印の理由に書く言葉。★この2つだけが「決めた」印として読まれる */
export const SAME_REPORT_IGNORE_REASON = "同じ日報なので数えない";
export const SAME_REPORT_BOTH_REASON = "別の日報として両方数える";
/** 「元に戻す」で、両方数えるの印を効かなくするときの言葉（消さずに効かなくする） */
export const SAME_REPORT_BOTH_UNDONE_REASON = `${SAME_REPORT_BOTH_REASON}（元に戻しました）`;

/** 印1件（控え＝経理の設定のひとこと欄に置く形。棚ができても同じ形で移せる） */
export type ReportDupRow = {
  /** どの組のことか（reportDupGroupKey の値） */
  group?: string | null;
  /** 数えないことにした日報の行の番号（両方数えるときも、印を付けた先として入れる） */
  ref_ids?: unknown;
  /** その組1行ぶんの売上（人が後から読んで分かるように。計算には使わない） */
  sales?: number | null;
  /** その日（YYYY-MM-DD） */
  happened_on?: string | null;
  reason?: string | null;
  /** 戻した日時。空＝いま効いている */
  undone_at?: string | null;
};

/** いま効いている印 */
export type ReportDupMarks = {
  /** 数えない日報の行の番号 */
  skipIds: Set<string>;
  /** 「1枚だけ数える」と決めた組 */
  countOnce: Set<string>;
  /** 「2枚とも本物」と決めた組 */
  bothCounted: Set<string>;
};

export function emptyReportDupMarks(): ReportDupMarks {
  return { skipIds: new Set(), countOnce: new Set(), bothCounted: new Set() };
}

/** その組を指す合言葉（日・お店・号車・出店先・担当・売上・経費の合計） */
export function reportDupGroupKey(
  g: Pick<
    DuplicateReportGroup,
    "date" | "shop" | "unit" | "location" | "staff" | "sales" | "expenseTotal"
  >,
): string {
  return [
    String(g.date ?? ""),
    String(g.shop ?? ""),
    String(g.unit ?? ""),
    String(g.location ?? ""),
    String(g.staff ?? ""),
    Number(g.sales) || 0,
    Number(g.expenseTotal) || 0,
  ].join("|");
}

/** その組で「数えない」ことにする行の番号（並びのあとの行ぜんぶ） */
export function laterIdsOf(g: Pick<DuplicateReportGroup, "ids">): string[] {
  const ids = (g.ids ?? []).map((v) => String(v ?? "").trim());
  // 1つでも番号が読めない行があると、どの行を外したか残せない
  if (ids.length < 2 || ids.some((v) => !v)) return [];
  return ids.slice(1);
}

/** その組は押して決められるか（行の番号が読めているか） */
export function canChooseReportDup(g: Pick<DuplicateReportGroup, "ids">): boolean {
  return laterIdsOf(g).length > 0;
}

/* ------------------------------------------------------------------ *
 *  印を読む
 * ------------------------------------------------------------------ */

function idsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const t = String(v ?? "").trim();
    if (t) out.push(t);
  }
  return out;
}

/**
 * 印から「いま効いているもの」を作る（計算だけ・通信しない）。
 *
 * ★戻した印（undone_at 入り）は効きません。
 *   ただし「別の日報として両方数える」の印だけは、
 *   **人が確かめて両方数えると決めた**という記録として読みます
 *   （この控えは「数えない」印しか効かせないので、効かせない形で決めごとを残します）。
 */
export function readReportDupMarks(
  rows: readonly ReportDupRow[] | null | undefined,
): ReportDupMarks {
  const marks = emptyReportDupMarks();
  for (const row of rows ?? []) {
    const group = String(row.group ?? "").trim();
    if (!group) continue;
    const reason = String(row.reason ?? "").trim();
    const live = !String(row.undone_at ?? "").trim();
    if (live && reason === SAME_REPORT_IGNORE_REASON) {
      marks.countOnce.add(group);
      marks.bothCounted.delete(group);
      for (const id of idsOf(row.ref_ids)) marks.skipIds.add(id);
      continue;
    }
    if (reason === SAME_REPORT_BOTH_REASON && !marks.countOnce.has(group)) {
      marks.bothCounted.add(group);
    }
  }
  return marks;
}

/** その組は、いまどうなっているか */
export type ReportDupDecision = "pending" | "count-once" | "both";

export function reportDupDecision(
  g: Parameters<typeof reportDupGroupKey>[0],
  marks: ReportDupMarks,
): ReportDupDecision {
  const key = reportDupGroupKey(g);
  if (marks.countOnce.has(key)) return "count-once";
  if (marks.bothCounted.has(key)) return "both";
  return "pending";
}

/** まだ決めていない組だけを残す（決めた組は「確かめてほしいこと」から外れる） */
export function pendingReportDupGroups(
  check: DuplicateReportCheck,
  marks: ReportDupMarks | null | undefined,
): DuplicateReportCheck {
  if (!marks) return check;
  const groups = check.groups.filter((g) => reportDupDecision(g, marks) === "pending");
  return {
    groups,
    extraReports: groups.reduce((t, g) => t + (g.count - 1), 0),
    extraSalesTotal: groups.reduce((t, g) => t + g.extraSales, 0),
    extraExpenseTotal: groups.reduce((t, g) => t + g.extraExpense, 0),
  };
}

/* ------------------------------------------------------------------ *
 *  数えない印を、月の集計に効かせる
 * ------------------------------------------------------------------ */

/** 数えなかった日報（画面に理由つきで出すため。黙って減らさない） */
export type SkippedReport = {
  date: string;
  location: string | null;
  shop: string | null;
  sales: number;
  id: string;
};

/**
 * 「同じ日報なので数えない」と決まった行を外した日報の一覧を作る。
 *
 * ★印が無ければ**何も外しません**（＝今までとまったく同じ数字）。
 * ★外すのは行まるごとです（売上・経費・日当がいっしょに消える）。
 *   ここで外せば、画面・会計ソフト向けCSV・試算表・1枚の要約が
 *   **同じ1か所から**同じ数字になります（3通りの数え方がずれません）。
 */
export function excludeDecidedDuplicateReports(params: {
  reports: readonly KeiriReport[];
  marks?: ReportDupMarks | null;
}): { reports: KeiriReport[]; skipped: SkippedReport[] } {
  const reports = [...(params.reports ?? [])];
  const marks = params.marks;
  if (!marks || marks.skipIds.size === 0) return { reports, skipped: [] };
  const kept: KeiriReport[] = [];
  const skipped: SkippedReport[] = [];
  for (const r of reports) {
    const id = String(r.id ?? "").trim();
    if (id && marks.skipIds.has(id)) {
      skipped.push({
        date: String(r.date ?? ""),
        location: r.location ?? null,
        shop: r.shop ?? null,
        sales: Number(r.sales_amount) || 0,
        id,
      });
      continue;
    }
    kept.push(r);
  }
  return { reports: kept, skipped };
}

/**
 * まだ決めていない組に入っている日報の行の番号。
 * ★会計ソフト向けの表（CSV）の摘要に「要確認」を足すのに使います（金額は1円も変えません）。
 */
export function pendingReportIds(
  check: DuplicateReportCheck,
  marks?: ReportDupMarks | null,
): Set<string> {
  const out = new Set<string>();
  for (const g of pendingReportDupGroups(check, marks).groups) {
    for (const id of g.ids) {
      const t = String(id ?? "").trim();
      if (t) out.add(t);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  押して決めたときに残す中身（通信はしない。形を決めるだけ）
 * ------------------------------------------------------------------ */

/**
 * 選んだ結果を、控えに置く1行にする（純粋な計算）。
 *
 * ★「2枚とも本物」は、**効かせない行**（undone_at 入り）で残します。
 *   こうしておくと、同じ組が毎月「確かめてほしいこと」に出続けません。
 * ★行の番号が読めない組では null（＝決められない。「残しました」と言わせないため）。
 */
export function reportDupWriteFor(
  g: DuplicateReportGroup,
  choice: ReportDupChoice,
  now: Date = new Date(),
): ReportDupRow | null {
  const later = laterIdsOf(g);
  if (later.length === 0) return null;
  const base = {
    group: reportDupGroupKey(g),
    sales: Number(g.sales) || 0,
    happened_on: String(g.date ?? "") || null,
  };
  if (choice === "count-once") {
    return { ...base, ref_ids: later, reason: SAME_REPORT_IGNORE_REASON, undone_at: null };
  }
  return {
    ...base,
    ref_ids: later,
    reason: SAME_REPORT_BOTH_REASON,
    undone_at: now.toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 *  画面に出す言葉（ここだけが文を持つ）
 * ------------------------------------------------------------------ */

export const SAME_REPORT_WORDS = {
  lead:
    "同じ日・同じ号車・同じ出店先・同じ担当で、売上もかかったお金もまったく同じ日報が2枚 入っています。" +
    "両方数えると、その月の売上とかかったお金がその分だけ多く出ます。" +
    "どちらにするか選んでください。日報は消えません。",
  countOnce: "同じ中身なので1枚だけ数える",
  both: "2枚とも本物（両方 数える）",
  countedOnce: "余分な1枚は、同じ日報なので数えていません（日報は残っています）",
  bothCounted: "別の日報として両方数えています",
  undo: "元に戻す",
  allClear: "同じ日報が2枚 入っている疑いはありません。",
  hint:
    "どちらの1枚を外しても、月の売上・かかったお金・残ったお金は1円も変わりません（中身が同じ2枚だからです）。" +
    "外した1枚の番号は控えに残るので、あとから元に戻せます。",
  notReady:
    "どちらを数えるかを選んで残しておく置き場が、まだ準備中です。" +
    "準備ができたら、このままここで選べるようになります（日報は消えません）。",
  memoKeep:
    "決めた内容は、経理の設定のひとこと欄に控えます（日報は消えません）。" +
    "置き場ができたら、そのまま記録に移ります。",
} as const;
