/**
 * 出店先 売上分析 の集計ロジック。
 *
 * - daily_reports（日報）の sales_amount / location / date から、
 *   ページを開いたときに「その場で」集計する（キャッシュ・cron なし）。
 * - 店舗名は normalizeOutletName で名寄せしてから集計する。
 *
 * ★ ランクは**この画面では計算しない**（2026-09 変更）。
 *   以前はここで平均売上からA〜Dを自分で決めていたが、出店場所マスタ
 *   （locations.rank）の等級と食い違い、同じ画面に「目標 ¥30,000（D）」と
 *   「B」が並ぶ状態になっていた。いまはランクの決め方を lib/locationRank.ts に
 *   一本化し、日報が保存されるたびにマスタを自動で書き換えている。
 *   この画面は **マスタの値をそのまま表示する**。
 *
 * ★ しきい値・損益分岐ラインなどの「あとで変えたくなる数字」は
 *    すべてこのファイル冒頭の定数に集約している（目標額だけは
 *    lib/locationRank.ts の RANK_TARGET が唯一の置き場所）。
 */

import { supabase } from "@/lib/supabase";
import { normalizeOutletName, isEventOutlet } from "./locationNormalizer";
import {
  RANK_TARGET,
  RECENT_VISITS,
  isRankCode,
  judgeRank,
  nextRankInfo,
  recentAverage as recentAverageOf,
  toDailySales,
  type RankCode,
} from "@/lib/locationRank";

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

export type { RankCode };

/** ランク定義（月の出店上限など、ランクにひもづく決めごと） */
export type RankDef = {
  code: RankCode;
  /** 1出店あたり目標（円）。lib/locationRank.ts の RANK_TARGET と同じ値 */
  target: number;
  /** 月の出店上限（回） */
  monthlyLimit: number;
  /** true の場合、上限は「同ランク全店の合計」で判定（D=チャレンジ枠） */
  aggregate?: boolean;
  /** 月の出店上限の目安テキスト */
  monthlyLimitLabel: string;
};

/**
 * ランクごとの決めごと（上＝強い順）。
 * 目標額は lib/locationRank.ts の RANK_TARGET から取る（二重に書かない）。
 * ※ S の月上限は今まで定義が無かったので、いったん A と同じ「月6回まで」にしている。
 */
export const RANK_DEFS: RankDef[] = [
  { code: "S", target: RANK_TARGET.S, monthlyLimit: 6, monthlyLimitLabel: "月6回まで" },
  { code: "A", target: RANK_TARGET.A, monthlyLimit: 6, monthlyLimitLabel: "月6回まで" },
  { code: "B", target: RANK_TARGET.B, monthlyLimit: 4, monthlyLimitLabel: "月4回まで" },
  { code: "C", target: RANK_TARGET.C, monthlyLimit: 4, monthlyLimitLabel: "月4回まで" },
  {
    code: "D",
    target: RANK_TARGET.D,
    monthlyLimit: 2,
    aggregate: true,
    monthlyLimitLabel: "チャレンジ枠（全店合計 月2回まで）",
  },
];

/** ランク記号 → 決めごと（無ければ null） */
export function rankDefOf(code: string | null | undefined): RankDef | null {
  return RANK_DEFS.find((d) => d.code === code) ?? null;
}

// -----------------------------------------------------------------------------
// 型
// -----------------------------------------------------------------------------

/** 平均の根拠（最新 か 参考値 か） */
export type AverageBasis = "latest" | "allPeriod";

/** ランク区分（S〜D / データ不足 / イベント枠） */
export type RankKind = RankCode | "INSUFFICIENT" | "EVENT";

/** 曜日別の平均（月→日の順で7要素。データが無い曜日は null） */
export type WeekdayAverage = {
  /** 月=0 ... 日=6 */
  labels: string[];
  averages: (number | null)[];
};

/** 出店場所マスタ（locations）のうち、集計に使う列 */
export type OutletMaster = {
  name: string;
  rank: string | null;
  target: number | null;
  rank_locked?: boolean | null;
};

export type OutletStats = {
  /** 名寄せ後の正式名 */
  name: string;
  /** ランク区分（マスタの locations.rank が正） */
  rankKind: RankKind;
  /** S〜D に該当する場合の決めごと（INSUFFICIENT/EVENT のときは null） */
  rankDef: RankDef | null;
  /** 1出店あたりの目標額（マスタの locations.target。無ければランク既定値） */
  target: number | null;
  /** マスタで「自動判定しない（固定）」になっているか */
  rankLocked: boolean;
  /** 表示する平均売上（円。6/10以降があればその平均、無ければ全期間） */
  average: number;
  /** 平均の根拠（最新 / 参考値） */
  basis: AverageBasis;
  /** 平均・表示の根拠にした出店回数 */
  reportCount: number;
  /** 全期間の総出店回数（参考表示用） */
  totalReportCount: number;
  /** ランク判定に使う「直近8回」の平均売上（円） */
  recentAverage: number;
  /** 直近8回の実際の回数（3回未満なら判定していない） */
  recentCount: number;
  /** 次のランク（S のときや判定できないときは null） */
  nextRank: RankCode | null;
  /** 次のランクまであといくら（円）。nextRank が null のときは null */
  toNextRank: number | null;
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
  /** true の日報は「集計から外す」扱い。平均・回数・ランク判定に数えない */
  exclude_from_stats?: boolean | null;
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
  /** 出店場所マスタ。ランクはここが正（渡さないとランクは付かない） */
  masters: OutletMaster[] = [],
): OutletStats[] {
  // マスタを名寄せ名で引けるようにする
  const masterByName = new Map<string, OutletMaster>();
  for (const m of masters) {
    const nm = normalizeOutletName(m.name);
    if (nm) masterByName.set(nm, m);
  }

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
  // ★「集計から外す」がONの日報は、ここで落とす。
  //   （売上そのものは消さない。月次集計・経理には今まで通り入っている）
  const groups = new Map<string, ReportRow[]>();
  for (const r of reports) {
    if (r.exclude_from_stats) continue;
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

    // 直近8回（1日1件に合算）の平均＝ランク自動判定の根拠
    const daily = toDailySales(all);
    const recent = recentAverageOf(daily, RECENT_VISITS);

    // ランク区分：出店場所マスタ（locations.rank）が正。画面では計算しない。
    const master = masterByName.get(name) ?? null;
    let rankKind: RankKind;
    let rankDef: RankDef | null = null;
    if (master && isRankCode(master.rank)) {
      rankKind = master.rank;
      rankDef = rankDefOf(master.rank);
    } else if (isEventOutlet(name)) {
      rankKind = "EVENT";
    } else {
      rankKind = "INSUFFICIENT";
    }

    // 「次のランクまで あと ¥◯◯」（マスタにランクがあるときだけ）
    const next =
      isRankCode(rankKind) && recent.count >= 1
        ? nextRankInfo(rankKind, recent.average)
        : null;

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
      target:
        master?.target ??
        (isRankCode(rankKind) ? RANK_TARGET[rankKind] : null),
      rankLocked: !!master?.rank_locked,
      average: avg,
      basis,
      reportCount,
      totalReportCount,
      recentAverage: recent.average,
      recentCount: recent.count,
      nextRank: next?.nextRank ?? null,
      toNextRank: next?.needed ?? null,
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
  //  1) S〜D ランク確定店 → 2) データ不足 → 3) イベント枠
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

  const [repRes, shiftRes, locRes] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("date, location, sales_amount, exclude_from_stats")
      // 手羽屋のぶんだけ（印が空＝手羽屋。lib/tenantScope.ts）
      .is("tenant_id", null),
    // 当月の予定出店（シフト）。中止は除く。
    supabase
      .from("shifts")
      .select("date, status, note, locations(name)")
      .neq("status", "cancelled")
      .gte("date", `${yearMonth}-01`)
      .lte("date", `${yearMonth}-31`),
    // 出店場所マスタ（ランク・目標はここが正）
    supabase.from("locations").select("name, rank, target, rank_locked"),
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
    (locRes.data as OutletMaster[]) || [],
  );
}

/** 互換用：平均売上からランクを出す（判定ルールは lib/locationRank.ts が本体） */
export { rankFromAverage, judgeRank } from "@/lib/locationRank";
