/**
 * 出店先ランクの「自動書き換え」を行うところ（データの出し入れ担当）。
 *
 * 判定のルールそのものは `lib/locationRank.ts` にある。ここはその結果を
 * 出店場所マスタ（locations）に反映し、変わったぶんを履歴
 * （location_rank_history）に残すだけ。
 *
 * ■ 大事なこと
 *   - **日報の保存を絶対に邪魔しない。** ここで何かエラーが出ても、
 *     握りつぶして console に出すだけにする（日報が保存できなくなる方が困る）。
 *   - **固定（rank_locked）が ON の出店先は触らない。**
 *     お祭り・イベント枠は毎回別の会場なので、自動判定になじまないため。
 *   - 日報の場所名は書き方がバラバラなので、`canonicalLocationName` で
 *     名前を揃えてからマスタと突き合わせる（→ CLAUDE.md 4-4）。
 */

import { supabase } from "@/lib/supabase";
import { canonicalLocationName } from "@/lib/locationName";
import {
  buildRankPlans,
  isRankCode,
  type RankCode,
  type RankLocationRow,
  type RankPlan,
  type RankReport,
} from "@/lib/locationRank";
import { applyTenantScope, readTenantScope } from "@/lib/tenantScope";

// 判定そのもの（純粋な計算）は lib/locationRank.ts にある。
// これまで通りここから使えるよう、型と関数をそのまま通しておく。
export { buildRankPlans, reportsForLocation } from "@/lib/locationRank";
export type { RankLocationRow, RankPlan } from "@/lib/locationRank";

// -----------------------------------------------------------------------------
// ここから下はデータベースとのやりとり
// -----------------------------------------------------------------------------

/** 出店場所マスタを読む（ランク判定に必要な列だけ） */
export async function fetchRankLocations(): Promise<RankLocationRow[]> {
  // 開いているお店のぶんだけ（手羽屋は印が空＝今までどおり）
  const { data, error } = await applyTenantScope<any>(
    supabase
      .from("locations")
      .select("id, name, rank, target, is_active, rank_locked") as any,
    readTenantScope(),
  ).order("name");
  if (error) throw error;
  return (data as RankLocationRow[]) || [];
}

/**
 * 判定に使う日報を読む。
 * ★ 集計に要るのは日付・場所・売上だけ。経費の明細は絶対に取らない（→ CLAUDE.md 4-2）。
 * ★「集計から外す」がONの日報も取ってくるが、判定では数えない（→ lib/locationRank.ts）。
 */
async function fetchRankReports(): Promise<
  (RankReport & { location: string | null })[]
> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select("date, location, sales_amount, exclude_from_stats")
    // 手羽屋のぶんだけ（印が空＝手羽屋。lib/tenantScope.ts）
    .is("tenant_id", null)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as (RankReport & { location: string | null })[]) || [];
}

/** 全出店先ぶんの「こう変えます」一覧を作る（まだ書き換えない） */
export async function planAllRankUpdates(): Promise<RankPlan[]> {
  const [locations, reports] = await Promise.all([
    fetchRankLocations(),
    fetchRankReports(),
  ]);
  return buildRankPlans(locations, reports);
}

/** 1件ぶん、マスタを書き換えて履歴を残す */
async function applyPlan(plan: RankPlan): Promise<void> {
  if (!plan.changed || !plan.newRank || plan.newTarget === null) return;

  const { error } = await supabase
    .from("locations")
    .update({ rank: plan.newRank, target: plan.newTarget })
    .eq("id", plan.locationId);
  if (error) throw error;

  // 履歴は「ランクが変わったとき」だけ残す（目標額だけの直しは履歴にしない）
  if (plan.currentRank === plan.newRank) return;
  const { error: histError } = await supabase
    .from("location_rank_history")
    .insert({
      location_id: plan.locationId,
      old_rank: plan.currentRank,
      new_rank: plan.newRank,
      avg_sales: plan.average,
      sample_count: plan.sampleCount,
    });
  if (histError) throw histError;
}

/** 予定の一覧をまとめて反映する。反映した件数を返す */
export async function applyRankPlans(plans: RankPlan[]): Promise<number> {
  let applied = 0;
  for (const p of plans) {
    if (!p.changed) continue;
    await applyPlan(p);
    applied += 1;
  }
  return applied;
}

/**
 * 日報が保存されたあとに呼ぶ。その出店先だけ判定し直してマスタを更新する。
 *
 * ★ここで失敗しても日報の保存は成功のまま。エラーは握りつぶして記録だけ残す。
 */
export async function recalcRankForLocation(
  rawLocationName: string,
): Promise<RankPlan | null> {
  try {
    const key = canonicalLocationName(rawLocationName);
    if (!key) return null;

    const locations = await fetchRankLocations();
    const target = locations.find(
      (l) => canonicalLocationName(l.name) === key && l.is_active,
    );
    if (!target) return null; // マスタに無い場所（単発のお祭りなど）は何もしない

    const reports = await fetchRankReports();
    const [plan] = buildRankPlans([target], reports);
    if (!plan) return null;

    await applyPlan(plan);
    return plan;
  } catch (e) {
    console.warn("ランクの自動判定に失敗しました（日報の保存には影響しません）", e);
    return null;
  }
}

/** ランク履歴の1行 */
export type RankHistoryRow = {
  id: number;
  location_id: number;
  old_rank: string | null;
  new_rank: string | null;
  avg_sales: number | null;
  sample_count: number | null;
  changed_at: string;
};

/** 出店先ごとのランク履歴（直近 limit 件ずつ）をまとめて読む */
export async function fetchRankHistory(
  limitPerLocation = 5,
): Promise<Map<number, RankHistoryRow[]>> {
  const { data, error } = await supabase
    .from("location_rank_history")
    .select("id, location_id, old_rank, new_rank, avg_sales, sample_count, changed_at")
    .order("changed_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const map = new Map<number, RankHistoryRow[]>();
  for (const row of ((data as RankHistoryRow[]) || [])) {
    const list = map.get(row.location_id) || [];
    if (list.length < limitPerLocation) {
      list.push(row);
      map.set(row.location_id, list);
    }
  }
  return map;
}

/** S〜D の文字列に直す（マスタの値が壊れていたときの保険） */
export function rankCodeOf(v: string | null | undefined): RankCode | null {
  return isRankCode(v) ? v : null;
}
