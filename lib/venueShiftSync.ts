/**
 * 問い合わせ(venue_inquiries) → シフト(shifts) の一方通行同期。
 *
 * 方向：問い合わせ → シフト の片方向のみ（シフト編集は問い合わせに戻さない）。
 * 紐付け：shifts.inquiry_id で 1問い合わせ=1シフト を管理（要マイグレーション）。
 *
 * ステータス対応：
 *   未連絡 → シフトを作らない（既存があれば中止）
 *   連絡中 → shifts.status = 'draft'（未確定）
 *   OK    → shifts.status = 'published'（確定済み）※LINE通知は送らない
 *   NG    → shifts.status = 'cancelled'（中止）
 *
 * 同期する項目：日付・会場(location_id/自由入力)・ランク・目標・担当・状態
 * シフト側だけの項目（開店/閉店時刻・備考）は上書きしない。
 *
 * ランク・目標は「問い合わせアプリの数字（機能B＝売上分析の自動判定ランク）」を正とする。
 */

import { supabase } from "@/lib/supabase";
import { matchLocation, type LocationMatch } from "@/lib/locationMatcher";
import { normalizeOutletName } from "@/lib/analytics/locationNormalizer";
import {
  getOutletAnalytics,
  RANK_DEFS,
  type OutletStats,
} from "@/lib/analytics/outletAnalytics";
import {
  FREE_VENUE_LOCATION_ID,
  composeNoteWithVenue,
  stripFreeVenueFromNote,
} from "@/app/components/ShiftFormModal";
import type { VenueInquiry, InquiryStatus } from "@/lib/venueInquiries";

/** 同期に必要な問い合わせの最小項目 */
export type SyncableInquiry = Pick<
  VenueInquiry,
  "id" | "date" | "store_name" | "status" | "assigned_staff"
>;

/** 問い合わせステータス → シフトstatus。null は「シフトを作らない」 */
const STATUS_TO_SHIFT: Record<
  InquiryStatus,
  "draft" | "published" | "cancelled" | null
> = {
  未連絡: null,
  連絡中: "draft",
  OK: "published",
  NG: "cancelled",
};

type ShiftRow = {
  id: number;
  location_id: number;
  status: string;
  note: string | null;
  staff_name: string | null;
  planned_open_time: string | null;
  planned_close_time: string | null;
  inquiry_id: number | null;
};

/**
 * ランク・目標を決める。機能B（売上分析の自動判定ランク）を最優先。
 *  - A〜D  → そのランク＋RANK_DEFSの目標
 *  - EVENT → 'S'（目標はマスタ値、無ければ0で後から手入力）
 *  - データ不足/実績なし → locationsマスタ(matchLocation) → 既定値C
 */
function resolveRankTarget(
  stats: OutletStats | null,
  matched: LocationMatch | null,
): { rank: string; target: number } {
  if (stats) {
    if (
      stats.rankKind === "A" ||
      stats.rankKind === "B" ||
      stats.rankKind === "C" ||
      stats.rankKind === "D"
    ) {
      const def = RANK_DEFS.find((d) => d.code === stats.rankKind);
      if (def) return { rank: def.code, target: def.target };
    }
    if (stats.rankKind === "EVENT") {
      return { rank: "S", target: matched?.target ?? 0 };
    }
    // INSUFFICIENT はマスタ/既定へフォールバック
  }
  if (matched) return { rank: matched.rank || "C", target: matched.target || 0 };
  return { rank: "C", target: 40000 };
}

/** 店名 → 機能Bの集計結果（名寄せして引く）。無ければ null */
async function statsForStore(storeName: string): Promise<OutletStats | null> {
  const all = await getOutletAnalytics();
  const key = normalizeOutletName(storeName);
  return all.find((s) => s.name === key) ?? null;
}

/** inquiry_id で既存シフトを1件取得（無ければ null） */
async function findShiftByInquiry(inquiryId: number): Promise<ShiftRow | null> {
  const { data, error } = await supabase
    .from("shifts")
    .select(
      "id, location_id, status, note, staff_name, planned_open_time, planned_close_time, inquiry_id",
    )
    .eq("inquiry_id", inquiryId)
    .limit(1);
  if (error) throw error;
  return ((data as ShiftRow[]) || [])[0] ?? null;
}

/**
 * 問い合わせ1件に対応するシフトを作成/更新/中止する（一方通行同期）。
 */
export async function syncShiftForInquiry(
  inq: SyncableInquiry,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const targetStatus = STATUS_TO_SHIFT[inq.status];
  const existing = await findShiftByInquiry(inq.id);

  // 未連絡：シフトは作らない。既存があれば中止（安全側）。
  if (targetStatus === null) {
    if (existing && existing.status !== "cancelled") {
      const { error } = await supabase
        .from("shifts")
        .update({ status: "cancelled", updated_at: nowIso })
        .eq("id", existing.id);
      if (error) throw error;
    }
    return;
  }

  // 日付が無いとシフト(date NOT NULL)を作れない。既存があれば状態だけ反映、無ければ何もしない。
  if (!inq.date) {
    if (existing) {
      const { error } = await supabase
        .from("shifts")
        .update({ status: targetStatus, updated_at: nowIso })
        .eq("id", existing.id);
      if (error) throw error;
    }
    return;
  }

  // ランク・目標（機能B優先）と会場(location_id/自由入力)を解決
  const [stats, matched] = await Promise.all([
    statsForStore(inq.store_name),
    matchLocation(inq.store_name),
  ]);
  const { rank, target } = resolveRankTarget(stats, matched);

  // 会場：マスタに一致すれば location_id、無ければ自由入力枠18＋noteに会場名。
  // 既存シフトの備考（会場名プレフィックスを除いた部分）は保持する。
  const baseNote = existing ? stripFreeVenueFromNote(existing.note) : "";
  const venue = matched
    ? { location_id: matched.id, note: baseNote || null }
    : {
        location_id: FREE_VENUE_LOCATION_ID,
        note: composeNoteWithVenue(inq.store_name, baseNote),
      };

  // 同期対象のみ書き込む。planned_open_time/close_time は payload に含めない＝保持される。
  const payload = {
    date: inq.date,
    location_id: venue.location_id,
    rank,
    target,
    // 担当は問い合わせを正とする。問い合わせが未設定なら既存を残す。
    staff_name: inq.assigned_staff ?? existing?.staff_name ?? null,
    status: targetStatus,
    note: venue.note,
    inquiry_id: inq.id,
    updated_at: nowIso,
  };

  if (existing) {
    const { error } = await supabase
      .from("shifts")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("shifts").insert(payload);
    if (error) throw error;
  }
}

/**
 * 問い合わせ削除時：対応シフトを中止(cancelled)にする（削除はしない）。
 * 月間目標や履歴を壊さないため、中止扱いで残す。
 */
export async function cancelShiftForInquiry(inquiryId: number): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("inquiry_id", inquiryId);
  if (error) throw error;
}
