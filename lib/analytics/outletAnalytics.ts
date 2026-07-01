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
  { code: "A", minAverage: 30000, target: 40000, monthlyLimitLabel: "月6回まで" },
  { code: "B", minAverage: 25000, target: 30000, monthlyLimitLabel: "月4回まで" },
  { code: "C", minAverage: 20000, target: 25000, monthlyLimitLabel: "月4回まで" },
  {
    code: "D",
    minAverage: 0,
    target: 20000,
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
export function computeOutletStats(reports: ReportRow[]): OutletStats[] {
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
    });
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
  const { data, error } = await supabase
    .from("daily_reports")
    .select("date, location, sales_amount");
  if (error) throw error;
  return computeOutletStats((data as ReportRow[]) || []);
}
