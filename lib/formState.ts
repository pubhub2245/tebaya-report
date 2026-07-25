import { businessDateStr } from "./format";

export const STAFF_OPTIONS = ["イデ", "じゅん", "かずき", "なぎさ", "さとみ", "ゆうや"];

export const STAFF_DAILY_PAY: Record<string, number> = {
  イデ: 9000,
  じゅん: 10000,
  かずき: 10000,
  なぎさ: 10000,
};
export const DEFAULT_DAILY_PAY = 10000;
export const OTHER_DAILY_PAY = 8500;
export const laborFor = (staff: string, isOther = false) => {
  if (STAFF_DAILY_PAY[staff] != null) return STAFF_DAILY_PAY[staff];
  if (isOther) return OTHER_DAILY_PAY;
  return DEFAULT_DAILY_PAY;
};

export type ExpenseRow = {
  description: string;
  amount: number;
  receipt_image_url?: string | null;
};


export type InventoryStatus = "○" | "△" | "×" | "";

export type CleanupInventory = {
  塩: InventoryStatus;
  ノリ塩: InventoryStatus;
  タレ: InventoryStatus;
  バター醤油: InventoryStatus;
  ポテト: InventoryStatus;
  片栗粉: InventoryStatus;
  油: InventoryStatus;
  "袋・折": InventoryStatus;
  ペーパー: InventoryStatus;
  "手袋・輪ゴム": InventoryStatus;
};

export type CleanupTasks = {
  "ガスorガソリン": boolean;
  仕込電話: boolean;
  フライヤー: boolean;
  器具洗浄: boolean;
  ゴミ捨て: boolean;
  "ガソリン（箱バン）": boolean;
  忘れ物確認: boolean;
};

export const CLEANUP_INVENTORY_ITEMS: (keyof CleanupInventory)[] = [
  "塩", "ノリ塩", "タレ", "バター醤油", "ポテト", "片栗粉", "油", "袋・折", "ペーパー", "手袋・輪ゴム",
];

export const CLEANUP_TASK_ITEMS: (keyof CleanupTasks)[] = [
  "ガスorガソリン", "仕込電話", "フライヤー", "器具洗浄", "ゴミ捨て", "ガソリン（箱バン）", "忘れ物確認",
];

export const initialCleanupInventory = (): CleanupInventory => ({
  塩: "", ノリ塩: "", タレ: "", バター醤油: "", ポテト: "", 片栗粉: "", 油: "", "袋・折": "", ペーパー: "", "手袋・輪ゴム": "",
});

export const initialCleanupTasks = (): CleanupTasks => ({
  "ガスorガソリン": false, 仕込電話: false, フライヤー: false, 器具洗浄: false, ゴミ捨て: false, "ガソリン（箱バン）": false, 忘れ物確認: false,
});

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
    negishio: number;
  };
  /** 月次限定商品（例：チキン南蛮）。商品名空欄なら DB は両方 NULL 保存。 */
  limited_product_name: string;
  limited_product_count: number;
  /** オールスター（¥1,300の詰め合わせ商品）の販売本数 */
  allstar_count: number;
  /** お客さんの組数（客数） */
  customer_groups: number;
  /** お酒の本数（記録のみ・売上計算には影響しない） */
  alcohol_count: number;
  expenses: ExpenseRow[];
  handover: string;
  unit_number: string;
  cleanup_inventory: CleanupInventory;
  cleanup_tasks: CleanupTasks;
};

export const initialForm = (): FormState => ({
  date: businessDateStr(),
  location: "",
  staff_name: "",
  sales_amount: 0,
  coins: { c10: 0, c50: 0, c100: 0, c500: 0, b1000: 0, b5000: 0, b10000: 0 },
  register_ok: true,
  register_diff: 0,
  labor: DEFAULT_DAILY_PAY,
  remaining: { tebasaki: 0, gyoza: 0, potato: 0, tornado: 0, negishio: 0 },
  limited_product_name: "",
  limited_product_count: 0,
  allstar_count: 0,
  customer_groups: 0,
  alcohol_count: 0,
  expenses: [],
  handover: "",
  unit_number: "",
  cleanup_inventory: initialCleanupInventory(),
  cleanup_tasks: initialCleanupTasks(),
});

export const STORAGE_KEY = "tebasaya-report-draft-v1";
