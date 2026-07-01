/**
 * venue_inquiries（出店先 問い合わせ管理）の型・DBアクセス・上限チェック。
 *
 * ★ テーブルは作成済み。ここでは select / insert / update のみ行う（DDLなし）。
 * ★ 売上サマリー・ランク判定は機能B（lib/analytics/*）を再利用する。
 */

import { supabase } from "@/lib/supabase";
import { normalizeOutletName } from "@/lib/analytics/locationNormalizer";
import {
  getOutletAnalytics,
  type OutletStats,
  type RankKind,
  type RankCode,
} from "@/lib/analytics/outletAnalytics";

// -----------------------------------------------------------------------------
// 型
// -----------------------------------------------------------------------------

export type InquiryStatus = "未連絡" | "連絡中" | "OK" | "NG";

export const STATUS_OPTIONS: InquiryStatus[] = ["未連絡", "連絡中", "OK", "NG"];

export type VenueInquiry = {
  id: number;
  date: string | null; // 出店したい日付 'YYYY-MM-DD'
  store_name: string;
  status: InquiryStatus;
  contacted_by: string | null;
  contacted_at: string | null;
  memo: string | null;
  rank: string | null;
  assigned_staff: string | null;
  slot: string | null; // '①' か '②'
  created_at: string;
  updated_at: string;
};

/** 追加/編集フォームが持つ入力値 */
export type InquiryInput = {
  date: string | null;
  store_name: string;
  status: InquiryStatus;
  contacted_by: string | null;
  memo: string | null;
  assigned_staff: string | null;
  slot: string | null;
};

// -----------------------------------------------------------------------------
// 定数: ランク別の月間出店上限（★ここ1か所で変更できる）
// -----------------------------------------------------------------------------

/**
 * ランク別の月間 OK（確保済み）上限回数。
 *  A: 1店舗につき月6回 / B: 月4回 / C: 月4回
 *  D: ★Dランク全店の「合計」で月2回（1店舗ごとではない）
 */
export const MONTHLY_OK_LIMITS: Record<RankCode, number> = {
  A: 6,
  B: 4,
  C: 4,
  D: 2,
};

/** D ランクは全店合計でカウントする（1店舗ごとではない） */
const AGGREGATE_RANKS: RankCode[] = ["D"];

// -----------------------------------------------------------------------------
// 機能B（売上分析）との連携
// -----------------------------------------------------------------------------

export type AnalyticsLookup = {
  /** 名寄せ後の店名 → 集計結果 */
  byName: Map<string, OutletStats>;
  /** 店名（生）→ ランク区分。実績が無ければ null */
  rankKindOf: (storeName: string) => RankKind | null;
  /** 店名（生）→ 集計結果。実績が無ければ null */
  statsOf: (storeName: string) => OutletStats | null;
};

/** 機能Bの集計を1回取得し、名寄せキーで引ける形にして返す */
export async function loadAnalyticsLookup(): Promise<AnalyticsLookup> {
  const stats = await getOutletAnalytics();
  const byName = new Map<string, OutletStats>();
  for (const s of stats) byName.set(s.name, s);

  const statsOf = (storeName: string): OutletStats | null => {
    const key = normalizeOutletName(storeName);
    return byName.get(key) ?? null;
  };
  const rankKindOf = (storeName: string): RankKind | null =>
    statsOf(storeName)?.rankKind ?? null;

  return { byName, rankKindOf, statsOf };
}

/** RankKind が A〜D（上限チェック対象）なら RankCode を返す。それ以外は null */
export function rankCodeForLimit(kind: RankKind | null): RankCode | null {
  if (kind === "A" || kind === "B" || kind === "C" || kind === "D") return kind;
  return null; // INSUFFICIENT / EVENT / 実績なし は対象外
}

// -----------------------------------------------------------------------------
// 月間上限チェック（純関数・テストしやすい）
// -----------------------------------------------------------------------------

/** 'YYYY-MM-DD' → 'YYYY-MM'。null や不正値は null */
export function monthOf(date: string | null): string | null {
  if (!date || date.length < 7) return null;
  return date.slice(0, 7);
}

export type LimitCheckResult = {
  /** true = OKにして良い / false = 上限超過でブロック */
  allowed: boolean;
  /** ブロック時の警告メッセージ */
  message?: string;
  /** 参考: 現在のOK件数と上限 */
  current?: number;
  limit?: number;
};

/**
 * ある行を status='OK' にしてよいか判定する純関数。
 *
 * @param rows            既存の全 venue_inquiries
 * @param rankKindOf      店名 → ランク区分（機能B）
 * @param editingId       編集中の行id（新規は null）。自分自身は二重カウントしない
 * @param storeName       対象の店名（生の入力）
 * @param date            対象の出店予定日
 */
export function checkOkLimit(params: {
  rows: VenueInquiry[];
  rankKindOf: (storeName: string) => RankKind | null;
  editingId: number | null;
  storeName: string;
  date: string | null;
}): LimitCheckResult {
  const { rows, rankKindOf, editingId, storeName, date } = params;

  const month = monthOf(date);
  if (!month) {
    return {
      allowed: false,
      message: "OKにするには出店予定日（date）を入力してください。",
    };
  }

  const code = rankCodeForLimit(rankKindOf(storeName));
  if (!code) return { allowed: true }; // A〜D以外は上限チェック対象外

  const limit = MONTHLY_OK_LIMITS[code];
  const isAggregate = AGGREGATE_RANKS.includes(code);
  const targetKey = normalizeOutletName(storeName);

  // 既存のOK件数を数える（編集中の自分自身は除外）
  let current = 0;
  for (const r of rows) {
    if (r.id === editingId) continue;
    if (r.status !== "OK") continue;
    if (monthOf(r.date) !== month) continue;

    if (isAggregate) {
      // Dランク: 同じ月の「Dランク店すべて」を合算
      if (rankCodeForLimit(rankKindOf(r.store_name)) === code) current += 1;
    } else {
      // A/B/C: 同じ店舗名（名寄せ後）のみ
      if (normalizeOutletName(r.store_name) === targetKey) current += 1;
    }
  }

  if (current >= limit) {
    const scope = isAggregate
      ? `${code}ランクは全店合計で月${limit}回まで`
      : `${code}ランクは1店舗 月${limit}回まで`;
    return {
      allowed: false,
      current,
      limit,
      message: `${scope}。既にこの月は${current}回OKになっています。これ以上はOKにできません。`,
    };
  }

  return { allowed: true, current, limit };
}

// -----------------------------------------------------------------------------
// DBアクセス（select / insert / update のみ）
// -----------------------------------------------------------------------------

/** 一覧取得（近い予定日順＝date昇順。null日付は末尾） */
export async function fetchInquiries(): Promise<VenueInquiry[]> {
  const { data, error } = await supabase
    .from("venue_inquiries")
    .select("*")
    .order("date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as VenueInquiry[]) || [];
}

/**
 * status に応じた contacted_at を決める。
 *  連絡中/OK/NG → 現在時刻を記録（未設定のときのみ新規記録）
 *  未連絡       → null に戻す
 */
function contactedAtFor(
  status: InquiryStatus,
  prev: string | null,
): string | null {
  if (status === "未連絡") return null;
  // 既に記録済みならそのまま活かし、無ければ現在時刻
  return prev ?? new Date().toISOString();
}

export async function insertInquiry(input: InquiryInput): Promise<void> {
  const now = new Date().toISOString();
  const payload = {
    date: input.date,
    store_name: input.store_name,
    status: input.status,
    contacted_by: input.contacted_by,
    contacted_at: contactedAtFor(input.status, null),
    memo: input.memo,
    assigned_staff: input.assigned_staff,
    slot: input.slot,
    updated_at: now,
  };
  const { error } = await supabase.from("venue_inquiries").insert(payload);
  if (error) throw error;
}

export async function updateInquiry(
  id: number,
  input: InquiryInput,
  prevContactedAt: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const payload = {
    date: input.date,
    store_name: input.store_name,
    status: input.status,
    contacted_by: input.contacted_by,
    contacted_at: contactedAtFor(input.status, prevContactedAt),
    memo: input.memo,
    assigned_staff: input.assigned_staff,
    slot: input.slot,
    updated_at: now,
  };
  const { error } = await supabase
    .from("venue_inquiries")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

/** ステータスだけを変更する（一覧のプルダウン用）。OK化時の上限チェックは呼び出し側で。 */
export async function updateStatus(
  id: number,
  status: InquiryStatus,
  prevContactedAt: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("venue_inquiries")
    .update({
      status,
      contacted_at: contactedAtFor(status, prevContactedAt),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
