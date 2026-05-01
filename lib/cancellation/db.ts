import { supabase } from "@/lib/supabase";
import type { CancellationReasonKey } from "./constants";

export type CancellationInput = {
  business_date: string;
  location: string;
  staff_name_raw: string;
  unit_number?: string | null;
  cancellation_reasons: CancellationReasonKey[];
  reason_other?: string | null;
  note?: string | null;
  canceled_by?: string | null;
};

export type CancellationRow = {
  id: string;
  business_date: string;
  location: string;
  staff_name_raw: string;
  unit_number: string | null;
  cancellation_reasons: CancellationReasonKey[];
  reason_other: string | null;
  note: string | null;
  canceled_by: string | null;
  created_at: string;
};

/**
 * 中止記録をINSERT。UNIQUE(business_date, location, staff_name_raw) 違反時は
 * upsert挙動で既存レコードを更新する。
 */
export async function createCancellation(
  input: CancellationInput,
): Promise<CancellationRow> {
  const payload = {
    business_date: input.business_date,
    location: input.location,
    staff_name_raw: input.staff_name_raw,
    unit_number: input.unit_number ?? null,
    cancellation_reasons: input.cancellation_reasons,
    reason_other: input.reason_other ?? null,
    note: input.note ?? null,
    canceled_by: input.canceled_by ?? null,
  };

  const { data, error } = await supabase
    .from("daily_cancellations")
    .upsert(payload, {
      onConflict: "business_date,location,staff_name_raw",
    })
    .select()
    .single();

  if (error) throw error;
  return data as CancellationRow;
}

/** 月単位で中止記録を取得（yyyymm = "2026-05" 形式） */
export async function getCancellationsForPeriod(
  yyyymm: string,
): Promise<CancellationRow[]> {
  const [yStr, mStr] = yyyymm.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const lastDay = new Date(y, m, 0).getDate();
  const start = `${yyyymm}-01`;
  const end = `${yyyymm}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("daily_cancellations")
    .select("*")
    .gte("business_date", start)
    .lte("business_date", end)
    .order("business_date", { ascending: false });

  if (error) throw error;
  return (data || []) as CancellationRow[];
}

/** 日付単位で中止記録を取得 */
export async function getCancellationsForDate(
  businessDate: string,
): Promise<CancellationRow[]> {
  const { data, error } = await supabase
    .from("daily_cancellations")
    .select("*")
    .eq("business_date", businessDate);

  if (error) throw error;
  return (data || []) as CancellationRow[];
}

/** 同じ日付・店舗・担当者の中止記録があるかチェック */
export async function isCancelled(
  businessDate: string,
  location: string,
  staffNameRaw: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("daily_cancellations")
    .select("id")
    .eq("business_date", businessDate)
    .eq("location", location)
    .eq("staff_name_raw", staffNameRaw)
    .limit(1);

  if (error) {
    console.error("[isCancelled] error:", error);
    return false;
  }
  return (data || []).length > 0;
}
