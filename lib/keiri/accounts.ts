/**
 * 科目（かもく）の定義。経理パッケージの共通部分。
 *
 * 「科目」＝ お金を仕分けるための箱の名前です
 * （家計簿の「食費」「光熱費」と同じ考え方）。
 *
 * ★ここにある9つ以外を勝手に増やさないこと。
 *   増やしたくなったら、先に docs/keiri.md を直してから。
 */

/** 科目のキー（コードの中で使う短い名前） */
export type AccountKey =
  | "sales" // 売上高
  | "purchase" // 仕入（材料）
  | "booth_fee" // 出店料
  | "payroll" // 人件費
  | "outsourcing" // 外注費（Alpha）
  | "vehicle" // 車両費（ガソリン・駐車場）
  | "supplies" // 消耗品費
  | "communication" // 通信費
  | "misc"; // 雑費

/** 経費側の科目キー（＝売上以外） */
export type ExpenseAccountKey = Exclude<AccountKey, "sales">;

export type AccountDef = {
  key: AccountKey;
  /** 画面とCSVに出す名前 */
  label: string;
  /** 売上か経費か */
  side: "revenue" | "expense";
  /**
   * 日報の経費明細（自由入力の文字）から自動で振り分けてよい科目かどうか。
   *
   * ★人件費・外注費は false。理由は docs/keiri.md 3-2。
   *   この2つは「発生した日」と「払った日」がズレるので、
   *   レジから払った経費（その場で現金が減るお金）と混ぜると
   *   現金残高が合わなくなるため。
   */
  fromExpenseText: boolean;
};

/** 科目の一覧（表示もこの順番） */
export const ACCOUNTS: AccountDef[] = [
  { key: "sales", label: "売上高", side: "revenue", fromExpenseText: false },
  { key: "purchase", label: "仕入（材料）", side: "expense", fromExpenseText: true },
  { key: "booth_fee", label: "出店料", side: "expense", fromExpenseText: true },
  { key: "payroll", label: "人件費", side: "expense", fromExpenseText: false },
  {
    key: "outsourcing",
    label: "外注費（Alpha）",
    side: "expense",
    fromExpenseText: false,
  },
  {
    key: "vehicle",
    label: "車両費（ガソリン・駐車場）",
    side: "expense",
    fromExpenseText: true,
  },
  { key: "supplies", label: "消耗品費", side: "expense", fromExpenseText: true },
  { key: "communication", label: "通信費", side: "expense", fromExpenseText: true },
  { key: "misc", label: "雑費", side: "expense", fromExpenseText: true },
];

/** 経費側の科目だけを、表示順で並べたもの */
export const EXPENSE_ACCOUNTS = ACCOUNTS.filter(
  (a) => a.side === "expense",
) as (AccountDef & { key: ExpenseAccountKey })[];

const BY_KEY = new Map(ACCOUNTS.map((a) => [a.key, a]));

/** 科目キーから表示名を引く。知らないキーはそのまま返す（画面を止めないため） */
export function accountLabel(key: AccountKey | string): string {
  return BY_KEY.get(key as AccountKey)?.label ?? String(key);
}

/** 振り分け先が無かったときに使う科目（＝雑費） */
export const FALLBACK_ACCOUNT: ExpenseAccountKey = "misc";
