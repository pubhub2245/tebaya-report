import { supabase } from "@/lib/supabase";

/** 入金(増える)か出金(減る)か */
export type CashDirection = "in" | "out";

/** 期首残高（スタート地点）設定 */
export type CashLedgerSettings = {
  id: string;
  opening_date: string; // YYYY-MM-DD
  opening_balance: number;
  updated_at?: string;
  updated_by?: string | null;
};

/** 手動の入金・出金1件 */
export type CashLedgerEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  direction: CashDirection;
  amount: number;
  category: string;
  memo: string | null;
  created_by?: string | null;
  created_at?: string;
};

/** よく使うカテゴリのプリセット */
export const OUT_CATEGORIES = [
  "銀行に預けた",
  "経費の支払い",
  "引き出し",
  "釣り銭の補充",
  "その他",
] as const;

export const IN_CATEGORIES = [
  "現金を戻した",
  "つり銭準備金の追加",
  "その他",
] as const;

/** 期首残高設定を取得（未設定なら null） */
export async function getCashSettings(): Promise<CashLedgerSettings | null> {
  const { data, error } = await supabase
    .from("cash_ledger_settings")
    .select("id, opening_date, opening_balance, updated_at, updated_by")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as CashLedgerSettings) ?? null;
}

/**
 * 期首残高を保存（1行だけ運用）。
 * 既存行があれば更新、なければ新規作成する。
 */
export async function saveCashSettings(
  openingDate: string,
  openingBalance: number,
): Promise<CashLedgerSettings> {
  const existing = await getCashSettings();
  if (existing) {
    const { data, error } = await supabase
      .from("cash_ledger_settings")
      .update({
        opening_date: openingDate,
        opening_balance: openingBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, opening_date, opening_balance, updated_at, updated_by")
      .single();
    if (error) throw error;
    return data as CashLedgerSettings;
  }
  const { data, error } = await supabase
    .from("cash_ledger_settings")
    .insert({ opening_date: openingDate, opening_balance: openingBalance })
    .select("id, opening_date, opening_balance, updated_at, updated_by")
    .single();
  if (error) throw error;
  return data as CashLedgerSettings;
}

/** 手動の入金・出金一覧（新しい順） */
export async function listCashEntries(): Promise<CashLedgerEntry[]> {
  const { data, error } = await supabase
    .from("cash_ledger_entries")
    .select("id, date, direction, amount, category, memo, created_by, created_at")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CashLedgerEntry[]) ?? [];
}

/** 手動の入金・出金を1件追加 */
export async function addCashEntry(input: {
  date: string;
  direction: CashDirection;
  amount: number;
  category: string;
  memo?: string;
}): Promise<CashLedgerEntry> {
  const { data, error } = await supabase
    .from("cash_ledger_entries")
    .insert({
      date: input.date,
      direction: input.direction,
      amount: input.amount,
      category: input.category,
      memo: input.memo?.trim() ? input.memo.trim() : null,
    })
    .select("id, date, direction, amount, category, memo, created_by, created_at")
    .single();
  if (error) throw error;
  return data as CashLedgerEntry;
}

/** 手動の入金・出金を1件削除 */
export async function deleteCashEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from("cash_ledger_entries")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** 指定日以降（その日を含む）の売上合計を daily_reports から取得 */
export async function getSalesSince(dateInclusive: string): Promise<number> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select("sales_amount")
    .gte("date", dateInclusive);
  if (error) throw error;
  return (data || []).reduce(
    (s: number, r: any) => s + (r.sales_amount || 0),
    0,
  );
}

/** 現金残高の内訳 */
export type CashBalanceBreakdown = {
  openingBalance: number;
  salesSince: number;
  inTotal: number;
  outTotal: number;
  balance: number;
};

/** 内訳から残高を計算 */
export function computeBalance(
  openingBalance: number,
  salesSince: number,
  entries: CashLedgerEntry[],
): CashBalanceBreakdown {
  const inTotal = entries
    .filter((e) => e.direction === "in")
    .reduce((s, e) => s + (e.amount || 0), 0);
  const outTotal = entries
    .filter((e) => e.direction === "out")
    .reduce((s, e) => s + (e.amount || 0), 0);
  return {
    openingBalance,
    salesSince,
    inTotal,
    outTotal,
    balance: openingBalance + salesSince + inTotal - outTotal,
  };
}
