import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Expense = {
  description: string;
  amount: number;
  receipt_image_url?: string | null;
};

export type DailyReport = {
  id?: string;
  created_at?: string;
  date: string;
  location: string;
  staff_name: string;
  sales_amount: number;
  cumulative_sales: number;
  register_total: number;
  register_ok: boolean;
  remaining_tebasaki: number;
  remaining_gyoza: number;
  remaining_potato: number;
  remaining_tornado: number;
  expenses: Expense[];
  handover: string;
  line_text: string;
};
