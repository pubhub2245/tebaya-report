/**
 * 「同じ中身の日報が2枚」が **入れ直し**（同じ日に数分あけて もう1回 保存された）
 * なのかを見分けて、**人が押さなくても1枚だけ数える**ところ
 *                                     （2026-11-03・f1-5・kp273）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   仕上げの ① は「人の手を借りずに正しく出る」ことです。
 *   ところが 11/3 時点の作りでは、同じ日報が2枚あると**誰かが画面でボタンを押すまで**
 *   その月の売上とかかったお金が二重のままでした（10月＝売上 45,050円・経費 10,317円 多い）。
 *   ＝ 月の締めが「人の手」を必要としており、①の条件を満たしません。
 *
 * ■ どこまでを機械が決めてよいか（ここが肝心）
 *   この疑いに入る2枚は、**日・お店・号車・出店先・担当・売上・経費の合計がすべて同じ**行だけです
 *   （lib/keiri/duplicates.ts）。その上でさらに2つ そろったときだけ「入れ直し」とみます：
 *     ① 2枚が**同じ日に倉庫に入っている**（入力日が同じ）
 *     ② 入った時刻の差が **60分以内**
 *   手羽屋の日報は1営業日・1号車につき1枚しか作らない作りなので、
 *   「同じ中身の行が、同じ日の数分後にもう1回 入っている」は**入れ直し**以外に説明がつきません
 *   （10/11＝17:02 と 17:14／10/12＝17:05 と 17:17）。
 *
 *   逆に、入った日が違う・時刻が離れている・入った時刻が読めない ときは
 *   **機械は決めません**（今までどおり「まだ決めていない」で画面に出し、人が押して決めます）。
 *   ＝ 迷ったら黙って売上を減らす側には倒しません。
 *
 * ■ 守ること
 *   ・**日報は1行も消しません・1円も書き換えません。** 数えないという印を置くだけです
 *   ・**人が決めた印のほうが必ず勝ちます。**［2枚とも本物（両方 数える）］を押した組は
 *     機械はもう触りません（＝あとから人が上書きできる）
 *   ・数えなかった分は「同じ日報なので数えていません（入れ直しとみています）」と
 *     画面と1枚の要約に**必ず出します**（黙って減らさない）
 *   ・手羽屋の毎日の画面（日報・シフト・レジ・LINE・lib/money.ts）には1行も触りません
 */

import { findDuplicateReports } from "./duplicates";
import type { DuplicateReportCheck, DuplicateReportGroup } from "./duplicates";
import type { KeiriReport } from "./types";
import {
  reportDupGroupKey,
  type ReportDupMarks,
  emptyReportDupMarks,
} from "./reportDups";

/** 入れ直しとみる、入った時刻の差の上限（分） */
export const RESAVE_WINDOW_MINUTES = 60;

/** 機械が「入れ直し」とみた組1つ */
export type ResavedReportGroup = {
  /** どの組のことか（reportDupGroupKey の値） */
  key: string;
  /** 残して数える1枚（いちばん先に入った行） */
  keepId: string;
  /** 数えない行（あとから入った行） */
  skipIds: string[];
  /** 入った日（YYYY-MM-DD・入力日。営業日ではありません） */
  enteredOn: string;
  /** 入った時刻の差（分・小数は切り上げ） */
  gapMinutes: number;
};

/** 日本時間の「入った日」（YYYY-MM-DD）。サーバーの時計は日本時間ではないため */
function jstDay(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const jst = new Date(t + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type Entered = { id: string; at: number; day: string };

/** その組の行の「入った時刻」を読む。1行でも読めなければ null（＝機械は決めない） */
function enteredOf(
  g: Pick<DuplicateReportGroup, "ids">,
  byId: Map<string, string>,
): Entered[] | null {
  const out: Entered[] = [];
  for (const raw of g.ids ?? []) {
    const id = String(raw ?? "").trim();
    if (!id) return null;
    const iso = byId.get(id);
    if (!iso) return null;
    const at = Date.parse(iso);
    const day = jstDay(iso);
    if (!Number.isFinite(at) || !day) return null;
    out.push({ id, at, day });
  }
  if (out.length < 2) return null;
  // 同じ時刻のときは行の番号で並びを1通りに決める（どちらを残しても金額は変わらない）
  out.sort((a, b) => (a.at !== b.at ? a.at - b.at : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * 「入れ直し」とみてよい組を探す（純粋な計算・通信しない）。
 * ★人がすでに決めている組（1枚だけ数える／2枚とも本物）は**最初から見ません**。
 */
export function findResavedReportDups(params: {
  check: DuplicateReportCheck;
  reports: readonly KeiriReport[];
  marks?: ReportDupMarks | null;
  windowMinutes?: number;
}): ResavedReportGroup[] {
  const windowMinutes = params.windowMinutes ?? RESAVE_WINDOW_MINUTES;
  const marks = params.marks;
  const byId = new Map<string, string>();
  for (const r of params.reports ?? []) {
    const id = String(r.id ?? "").trim();
    const iso = String(r.created_at ?? "").trim();
    if (id && iso) byId.set(id, iso);
  }
  const out: ResavedReportGroup[] = [];
  for (const g of params.check?.groups ?? []) {
    const key = reportDupGroupKey(g);
    // ★人が決めた印のほうが勝つ（押した結果を機械が上書きしない）
    if (marks && (marks.countOnce.has(key) || marks.bothCounted.has(key))) continue;
    const entered = enteredOf(g, byId);
    if (!entered) continue;
    const day = entered[0].day;
    if (entered.some((e) => e.day !== day)) continue;
    const gapMs = entered[entered.length - 1].at - entered[0].at;
    if (gapMs < 0 || gapMs > windowMinutes * 60 * 1000) continue;
    out.push({
      key,
      keepId: entered[0].id,
      skipIds: entered.slice(1).map((e) => e.id),
      enteredOn: day,
      gapMinutes: Math.ceil(gapMs / 60000),
    });
  }
  return out;
}

/**
 * 機械が決めた印を、人の印に**足した**ものを返す（人の印は1つも消しません）。
 * ★渡す印が無く、入れ直しも1組も無ければ、**まったく同じ数字**になります。
 */
export function withResaveMarks(
  resaved: readonly ResavedReportGroup[],
  marks?: ReportDupMarks | null,
): ReportDupMarks {
  const base: ReportDupMarks = marks
    ? {
        skipIds: new Set(marks.skipIds),
        countOnce: new Set(marks.countOnce),
        bothCounted: new Set(marks.bothCounted),
      }
    : emptyReportDupMarks();
  for (const r of resaved) {
    if (base.countOnce.has(r.key) || base.bothCounted.has(r.key)) continue;
    base.countOnce.add(r.key);
    for (const id of r.skipIds) base.skipIds.add(id);
  }
  return base;
}

/**
 * **読んでいる全部の月**について「入れ直し」を探す（画面用）。
 * ★経理の画面は数え始めの日から今日までを1回で読むので、月ごとに見分けます。
 */
export function findResavedAllMonths(params: {
  reports: readonly KeiriReport[];
  marks?: ReportDupMarks | null;
}): ResavedReportGroup[] {
  const months = new Set<string>();
  for (const r of params.reports ?? []) {
    const m = String(r.date ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) months.add(m);
  }
  const out: ResavedReportGroup[] = [];
  for (const ym of Array.from(months).sort()) {
    out.push(
      ...findResavedReportDups({
        check: findDuplicateReports({ ym, reports: [...(params.reports ?? [])] }),
        reports: params.reports,
        marks: params.marks,
      }),
    );
  }
  return out;
}

/** 機械が決めた組の合言葉だけを集める（画面で「自動です」と出し分けるのに使う） */
export function resavedKeySet(resaved: readonly ResavedReportGroup[]): Set<string> {
  return new Set(resaved.map((r) => r.key));
}

/** 画面に出す言葉（ここだけが文を持つ） */
export const RESAVE_WORDS = {
  decided: "同じ日に入れ直された1枚とみて、1枚だけ数えています（自動）",
  why: (g: Pick<ResavedReportGroup, "enteredOn" | "gapMinutes">) =>
    `どちらも ${g.enteredOn} に入っていて、入った時刻の差が ${g.gapMinutes}分だったためです。`,
  override:
    "入れ直しではなく本当に2枚ある場合は、［2枚とも本物（両方 数える）］を押してください。押した内容が優先されます。",
  note: (count: number) =>
    `うち ${count}枚は、同じ日に ${RESAVE_WINDOW_MINUTES}分以内に入れ直されたものとみて、機械が自動で1枚だけ数えました。` +
    "日報は消していません。本当に2枚ある場合は経理の画面で［2枚とも本物］を押してください。",
} as const;
