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

// 現金が入ってくる経路は「売上（日報から自動）／緒方・川畑の手出し現金」のみ。
// 売上は自動集計するため、手入力の入金は手出しが中心。
export const IN_CATEGORIES = ["緒方 手出し", "川畑 手出し", "その他"] as const;

// 現金が出ていくのは経費が中心（経費は日報の立替経費から自動反映）。
// ここでは銀行入金・引き出しなど、日報以外の臨時の出金を手入力する。
export const OUT_CATEGORIES = ["銀行に預けた", "引き出し", "その他"] as const;

// 日報の「手出し現金」ステップで選ぶ人
export const TEDASHI_PEOPLE = ["緒方", "川畑"] as const;
export const tedashiCategory = (person: string) => `${person} 手出し`;

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

/**
 * 日報から現金の増減をまとめて保存する。
 * 再提出時の二重計上を防ぐため、同じ日付・同じ担当者の「日報由来」記録
 * （created_by = 担当者名）を一度削除してから入れ直す。
 * 管理者ページで手入力した記録（created_by = null）は削除されない。
 */
export async function saveReportCashMoves(
  date: string,
  staffName: string,
  moves: {
    direction: CashDirection;
    amount: number;
    category: string;
    memo?: string;
  }[],
): Promise<void> {
  const { error: delError } = await supabase
    .from("cash_ledger_entries")
    .delete()
    .eq("date", date)
    .eq("created_by", staffName);
  if (delError) throw delError;

  const rows = moves
    .filter((m) => m.amount && m.amount > 0)
    .map((m) => ({
      date,
      direction: m.direction,
      amount: m.amount,
      category: m.category,
      memo: m.memo?.trim() ? m.memo.trim() : null,
      created_by: staffName,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from("cash_ledger_entries").insert(rows);
  if (error) throw error;
}

/** 手動の入金・出金を1件削除 */
export async function deleteCashEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from("cash_ledger_entries")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** 日報1件分の現金に関わる情報（売上＝入金、立替経費＝出金の元データ） */
export type ReportCashRow = {
  id: string;
  date: string;
  location: string | null;
  staff_name: string | null;
  sales_amount: number;
  expenses_total: number;
};

/**
 * 指定日以降（その日を含む）の日報を、現金集計に必要な形で取得する。
 * 売上＝入金、立替経費（expenses の合計）＝出金 として扱う。
 */
export async function getReportsSince(
  dateInclusive: string,
): Promise<ReportCashRow[]> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select("id, date, location, staff_name, sales_amount, expenses")
    .gte("date", dateInclusive)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any) => {
    const arr = Array.isArray(r.expenses) ? r.expenses : [];
    const expenses_total = arr.reduce(
      (t: number, e: any) => t + (e?.amount || 0),
      0,
    );
    return {
      id: String(r.id),
      date: r.date,
      location: r.location ?? null,
      staff_name: r.staff_name ?? null,
      sales_amount: r.sales_amount || 0,
      expenses_total,
    };
  });
}
