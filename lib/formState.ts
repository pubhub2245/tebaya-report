import { todayStr } from "./format";

export const STAFF_DAILY_PAY: Record<string, number> = {
  イデ: 9000,
  じゅん: 10000,
  かずき: 10000,
  なぎさ: 10000,
};
export const DEFAULT_DAILY_PAY = 10000;
export const laborFor = (staff: string) =>
  STAFF_DAILY_PAY[staff] ?? DEFAULT_DAILY_PAY;

export type ExpenseRow = {
  description: string;
  amount: number;
  receipt_image_url?: string | null;
};

export type FormState = {
  date: string;
  location: string;
  staff_name: string;
  sales_amount: number;
  coins: {
    c10: number;
    c50: number;
    c100: number;
    c500: number;
    b1000: number;
    b5000: number;
    b10000: number;
  };
  register_ok: boolean;
  register_diff: number;
  labor: number;
  remaining: {
    tebasaki: number;
    gyoza: number;
    potato: number;
    tornado: number;
  };
  expenses: ExpenseRow[];
  handover: string;
};

export const initialForm = (): FormState => ({
  date: todayStr(),
  location: "",
  staff_name: "",
  sales_amount: 0,
  coins: { c10: 0, c50: 0, c100: 0, c500: 0, b1000: 0, b5000: 0, b10000: 0 },
  register_ok: true,
  register_diff: 0,
  labor: DEFAULT_DAILY_PAY,
  remaining: { tebasaki: 0, gyoza: 0, potato: 0, tornado: 0 },
  expenses: [],
  handover: "",
});

export const STORAGE_KEY = "tebasaya-report-draft-v1";
