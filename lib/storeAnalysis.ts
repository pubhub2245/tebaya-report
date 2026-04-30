// 月ごとの店舗別ランク分析データ。
// 4月分はLINEログ＋シフト目標から手動で精査して data/april_store_analysis.json に整理済み。
// 5月以降は別途同形式のJSONを追加していく想定。

import april2026 from "../data/april_store_analysis.json";

type RawEntry = {
  store: string;
  count: number;
  target_total: number;
  sales_total: number;
  achievement_rate: number;
  avg_per_visit: number;
  most_common_rank: string;
  suggested_rank: string;
  rank_change_needed: boolean;
};

type RawAnalysis = {
  month: string;
  total_reports: number;
  total_sales: number;
  total_target: number;
  stores: RawEntry[];
  stores_ok: RawEntry[];
  canceled_days: { date: string; reason: string; estimated_target: number }[];
  canceled_target_total: number;
};

const REGISTRY: Record<string, RawAnalysis> = {
  "2026-04": april2026 as RawAnalysis,
};

export type StoreReviewEntry = {
  store: string;
  current_rank: string;
  suggested_rank: string;
  achievement_rate: number;
  avg_per_visit: number;
  count: number;
};

export type StoreOkEntry = {
  store: string;
  current_rank: string;
  achievement_rate: number;
  avg_per_visit: number;
  count: number;
};

export type StoreAnalysisForOutro = {
  storesNeedReview: StoreReviewEntry[];
  storesOk: StoreOkEntry[];
  canceledDays: string[];
} | null;

const formatCanceled = (
  c: { date: string; reason: string; estimated_target: number }[],
): string[] =>
  c.map((x) => {
    const [, m, d] = x.date.split("-");
    return `${parseInt(m)}/${parseInt(d)} ${x.reason}`;
  });

export const getStoreAnalysisForMonth = (
  ym: string,
): StoreAnalysisForOutro => {
  const data = REGISTRY[ym];
  if (!data) return null;
  return {
    storesNeedReview: data.stores.map((s) => ({
      store: s.store,
      current_rank: s.most_common_rank,
      suggested_rank: s.suggested_rank,
      achievement_rate: s.achievement_rate,
      avg_per_visit: s.avg_per_visit,
      count: s.count,
    })),
    storesOk: data.stores_ok.map((s) => ({
      store: s.store,
      current_rank: s.most_common_rank,
      achievement_rate: s.achievement_rate,
      avg_per_visit: s.avg_per_visit,
      count: s.count,
    })),
    canceledDays: formatCanceled(data.canceled_days),
  };
};
