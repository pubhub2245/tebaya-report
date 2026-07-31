/**
 * 出店先 売上分析 の集計ロジック。
 *
 * - daily_reports（日報）の sales_amount / location / date から、
 *   ページを開いたときに「その場で」集計する（キャッシュ・cron なし）。
 * - 店舗名は normalizeOutletName で名寄せしてから集計する。
 *
 * ★ しきい値・損益分岐ラインなどの「あとで変えたくなる数字」は
 *    すべてこのファイル冒頭の定数に集約している。
 */

import { supabase } from "@/lib/supabase";
import { normalizeOutletName, isEventOutlet } from "./locationNormalizer";

// -----------------------------------------------------------------------------
// 定数（あとで変えたくなる数字はここに集約）
// -----------------------------------------------------------------------------

/** 損益分岐ライン（この金額以上なら黒字ライン＝🟢） */
export const BREAK_EVEN_LINE = 25000;

/**
 * 営業時間が短縮された基準日。
 * この日（含む）以降の日報があれば「最新（14-19時）」の平均を使う。
 * 無ければ全期間平均を「参考値」として使う。
 */
export const HOURS_CHANGE_DATE = "2026-06-10";

/** ランク判定に必要な最低出店回数（これ未満は「データ不足」扱い） */
export const MIN_REPORTS_FOR_RANK = 3;

export type RankCode = "A" | "B" | "C" | "D";

/** ランク定義（平均売上のしきい値で自動判定） */
export type RankDef = {
  code: RankCode;
  /** この平均売上「以上」なら該当（円） */
  minAverage: number;
  /** 1出店あたり目標（円） */
  target: number;
  /** 月の出店上限（回） */
  monthlyLimit: number;
  /** true の場合、上限は「同ランク全店の合計」で判定（D=チャレンジ枠） */
  aggregate?: boolean;
  /** 月の出店上限の目安テキスト */
  monthlyLimitLabel: string;
};

/**
 * 上から順（高い方から）に判定する。
 *  A: 平均 3万〜4万 ／目標4万／月上限6回
 *  B: 平均 2.5万〜3万 ／目標3万／月上限4回
 *  C: 平均 2万〜2.5万 ／目標2.5万／月上限4回
 *  D: 平均 2万以下 ／目標2万／チャレンジ（全店合計 月2回まで）
 */
export const RANK_DEFS: RankDef[] = [
  { code: "A", minAverage: 30000, target: 40000, monthlyLimit: 6, monthlyLimitLabel: "月6回まで" },
  { code: "B", minAverage: 25000, target: 30000, monthlyLimit: 4, monthlyLimitLabel: "月4回まで" },
  { code: "C", minAverage: 20000, target: 25000, monthlyLimit: 4, monthlyLimitLabel: "月4回まで" },
  {
    code: "D",
    minAverage: 0,
    target: 20000,
    monthlyLimit: 2,
    aggregate: true,
    monthlyLimitLabel: "チャレンジ枠（全店合計 月2回まで）",
  },
];

/** 平均売上から A〜D を判定する純関数 */
export function rankFromAverage(average: number): RankDef {
  for (const def of RANK_DEFS) {
    if (average >= def.minAverage) return def;
  }
  return RANK_DEFS[RANK_DEFS.length - 1];
}

// -----------------------------------------------------------------------------
// 型
// -----------------------------------------------------------------------------

/** 平均の根拠（最新 か 参考値 か） */
export type AverageBasis = "latest" | "allPeriod";

/** ランク区分（A〜D / データ不足 / イベント枠） */
export type RankKind = RankCode | "INSUFFICIENT" | "EVENT";

/** 曜日別の平均（月→日の順で7要素。データが無い曜日は null） */
export type WeekdayAverage = {
  /** 月=0 ... 日=6 */
  labels: string[];
  averages: (number | null)[];
};

export type OutletStats = {
  /** 名寄せ後の正式名 */
  name: string;
  /** ランク区分 */
  rankKind: RankKind;
  /** A〜D に該当する場合の定義（INSUFFICIENT/EVENT のときは null） */
  rankDef: RankDef | null;
  /** 表示する平均売上（円） */
  average: number;
  /** 平均の根拠（最新 / 参考値） */
  basis: AverageBasis;
  /** 平均・ランクの根拠にした出店回数 */
  reportCount: number;
  /** 全期間の総出店回数（参考表示用） */
  totalReportCount: number;
  /** 損益分岐ラインを超えているか（average >= BREAK_EVEN_LINE） */
  aboveBreakEven: boolean;
  /** 曜日別平均 */
  weekday: WeekdayAverage;
  /** 今月の消化回数＝実績＋予定（同じ日は二重に数えない）。yearMonth 指定時のみ */
  usedThisMonth: number;
  /** 今月の実績出店回数（日報ベース） */
  actualThisMonth: number;
  /** 今月の予定回数（シフトのうち日報と重複しない日数） */
  plannedThisMonth: number;
  /** 今月の残り出店可能回数（rankDef があり yearMonth 指定時のみ。無ければ null） */
  remaining: number | null;
  /** 上限が「同ランク全店の合計」で判定されるか（D=チャレンジ枠） */
  isAggregateLimit: boolean;
};

/** シフト等の「予定出店」1件（名寄せ前の会場名と日付） */
export type PlannedOutlet = {
  date: string;
  location: string;
};

type ReportRow = {
  date: string;
  location: string;
  sales_amount: number | null;
};

// -----------------------------------------------------------------------------
// 集計
// -----------------------------------------------------------------------------

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

/** 'YYYY-MM-DD' → 月=0..日=6 のインデックス */
function weekdayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay(); // 日=0..土=6
  return (js + 6) % 7; // 月=0..日=6 に変換
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sum = nums.reduce((s, n) => s + n, 0);
  return Math.round(sum / nums.length);
}

function buildWeekdayAverage(reports: ReportRow[]): WeekdayAverage {
  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const r of reports) {
    const idx = weekdayIndex(r.date);
    buckets[idx].push(r.sales_amount || 0);
  }
  return {
    labels: WEEKDAY_LABELS,
    averages: buckets.map((b) => (b.length > 0 ? average(b) : null)),
  };
}

/**
 * 名寄せ済みの店舗ごとに OutletStats を組み立てる純関数。
 * テストしやすいよう、DB取得とは分離している。
 */
export function computeOutletStats(
  reports: ReportRow[],
  /** 残り回数集計の対象月 'YYYY-MM'。省略時は残りを算出しない（null） */
  yearMonth?: string,
  /** 予定出店（シフト等）。対象月ぶんを渡すと残り回数に反映する */
  planned: PlannedOutlet[] = [],
): OutletStats[] {
  // 予定出店を名寄せ名ごとの日付集合に（対象月のみ）
  const plannedByName = new Map<string, Set<string>>();
  if (yearMonth) {
    for (const p of planned) {
      if ((p.date || "").slice(0, 7) !== yearMonth) continue;
      const nm = normalizeOutletName(p.location);
      if (!nm) continue;
      const set = plannedByName.get(nm) || new Set<string>();
      set.add(p.date);
      plannedByName.set(nm, set);
    }
  }

  // 名寄せ後の名前でグループ化
  const groups = new Map<string, ReportRow[]>();
  for (const r of reports) {
    const name = normalizeOutletName(r.location);
    if (!name) continue;
    const list = groups.get(name) || [];
    list.push(r);
    groups.set(name, list);
  }

  const result: OutletStats[] = [];
  for (const [name, all] of groups) {
    // 6/10以降のデータがあれば「最新」、無ければ全期間を「参考値」
    const post = all.filter((r) => r.date >= HOURS_CHANGE_DATE);
    const basis: AverageBasis = post.length > 0 ? "latest" : "allPeriod";
    const effective = post.length > 0 ? post : all;

    const avg = average(effective.map((r) => r.sales_amount || 0));
    const reportCount = effective.length;
    const totalReportCount = all.length;

    // ランク区分の判定
    let rankKind: RankKind;
    let rankDef: RankDef | null = null;
    if (isEventOutlet(name)) {
      rankKind = "EVENT";
    } else if (reportCount < MIN_REPORTS_FOR_RANK) {
      rankKind = "INSUFFICIENT";
    } else {
      rankDef = rankFromAverage(avg);
      rankKind = rankDef.code;
    }

    // 今月の消化＝実績(日報)＋予定(シフト)。同じ日は二重に数えない。
    const actualDates = new Set<string>();
    if (yearMonth) {
      for (const r of all) {
        if ((r.date || "").slice(0, 7) === yearMonth) actualDates.add(r.date);
      }
    }
    const plannedDates = plannedByName.get(name) || new Set<string>();
    const unionDates = new Set<string>(actualDates);
    for (const d of plannedDates) unionDates.add(d);
    const actualThisMonth = actualDates.size;
    const usedThisMonth = unionDates.size;
    const plannedThisMonth = usedThisMonth - actualThisMonth;

    result.push({
      name,
      rankKind,
      rankDef,
      average: avg,
      basis,
      reportCount,
      totalReportCount,
      aboveBreakEven: avg >= BREAK_EVEN_LINE,
      weekday: buildWeekdayAverage(effective),
      usedThisMonth,
      actualThisMonth,
      plannedThisMonth,
      remaining: null,
      isAggregateLimit: !!rankDef?.aggregate,
    });
  }

  // 残り出店可能回数を算出（yearMonth 指定時のみ）
  if (yearMonth) {
    // 集計上限（D=チャレンジ枠）は「同ランク全店の今月合計」で判定する
    const aggregateUsed = new Map<RankCode, number>();
    for (const s of result) {
      if (s.rankDef?.aggregate) {
        aggregateUsed.set(
          s.rankDef.code,
          (aggregateUsed.get(s.rankDef.code) || 0) + s.usedThisMonth,
        );
      }
    }
    for (const s of result) {
      if (!s.rankDef) continue;
      const used = s.rankDef.aggregate
        ? aggregateUsed.get(s.rankDef.code) || 0
        : s.usedThisMonth;
      s.remaining = Math.max(0, s.rankDef.monthlyLimit - used);
    }
  }

  // 並び順:
  //  1) A〜D ランク確定店 → 2) データ不足 → 3) イベント枠
  //  各グループ内では平均売上の高い順
  const tier = (k: RankKind): number =>
    k === "INSUFFICIENT" ? 1 : k === "EVENT" ? 2 : 0;
  result.sort((a, b) => {
    const t = tier(a.rankKind) - tier(b.rankKind);
    if (t !== 0) return t;
    return b.average - a.average;
  });

  return result;
}

/**
 * daily_reports を全件取得し、その場で集計して返す（リアルタイム集計）。
 * 手羽屋の規模なら全件取得でも十分速い。
 */
export async function getOutletAnalytics(): Promise<OutletStats[]> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [repRes, shiftRes] = await Promise.all([
    supabase.from("daily_reports").select("date, location, sales_amount"),
    // 当月の予定出店（シフト）。中止は除く。
    supabase
      .from("shifts")
      .select("date, status, note, locations(name)")
      .neq("status", "cancelled")
      .gte("date", `${yearMonth}-01`)
      .lte("date", `${yearMonth}-31`),
  ]);
  if (repRes.error) throw repRes.error;

  const FREE_VENUE_PREFIX = "会場名｜";
  const planned: PlannedOutlet[] = ((shiftRes.data as any[]) || [])
    .map((s) => {
      // 自由入力会場は note の「会場名｜◯◯」から、それ以外は locations.name
      let name = "";
      const note: string | null = s.note ?? null;
      if (note && note.startsWith(FREE_VENUE_PREFIX)) {
        const rest = note.slice(FREE_VENUE_PREFIX.length);
        const nl = rest.indexOf("\n");
        name = (nl === -1 ? rest : rest.slice(0, nl)).trim();
      }
      if (!name) name = s.locations?.name ?? "";
      return { date: s.date as string, location: name };
    })
    .filter((p) => p.location);

  return computeOutletStats(
    (repRes.data as ReportRow[]) || [],
    yearMonth,
    planned,
  );
}
