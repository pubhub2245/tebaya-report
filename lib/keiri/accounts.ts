/**
 * 科目（かもく）の定義。経理パッケージの共通部分。
 *
 * 「科目」＝ お金を仕分けるための箱の名前です
 * （家計簿の「食費」「光熱費」と同じ考え方）。
 *
 * ★ここにある12個以外を勝手に増やさないこと。
 *   増やしたくなったら、先に docs/keiri.md を直してから。
 */

/** 科目のキー（コードの中で使う短い名前） */
export type AccountKey =
  | "sales" // 売上高
  | "purchase" // 仕入（材料）
  | "booth_fee" // 出店料
  | "rent" // 家賃（事務所）
  | "payroll" // 人件費（日報の日当。月に1回まとめて払う）
  | "payroll_daily" // 人件費（当日払い。レジのお金からその日に払った給与）
  | "outsourcing" // 外注費（Alpha）
  | "vehicle" // 車両費（ガソリン・駐車場）
  | "supplies" // 消耗品費
  | "lease" // 賃借料（レンタル）
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
   * ★人件費・外注費・家賃は false。理由は docs/keiri.md 3-2。
   *   この3つは「発生した日」と「払った日」がズレるので、
   *   レジから払った経費（その場で現金が減るお金）と混ぜると
   *   現金残高が合わなくなるため。
   */
  fromExpenseText: boolean;
  /**
   * 画面とCSVで、この科目をまとめて見せる先。
   *
   * ★「人件費（当日払い）」は、計算の中では別の箱に分けています
   *   （現金の減り方が違うため。docs/keiri.md 3-3）。
   *   でも人が見るときは「人件費」の一部なので、表・グラフ・CSVでは
   *   まとめ先（payroll）の名前で出します。
   */
  mergeInto?: AccountKey;
};

/** 科目の一覧（表示もこの順番） */
export const ACCOUNTS: AccountDef[] = [
  { key: "sales", label: "売上高", side: "revenue", fromExpenseText: false },
  { key: "purchase", label: "仕入（材料）", side: "expense", fromExpenseText: true },
  { key: "booth_fee", label: "出店料", side: "expense", fromExpenseText: true },
  // 事務所の家賃。日報からは取らず、毎月きまった額を自動で計上する（docs/keiri.md 5-3b）
  { key: "rent", label: "家賃（事務所）", side: "expense", fromExpenseText: false },
  { key: "payroll", label: "人件費", side: "expense", fromExpenseText: false },
  // レジのお金からその日に払った給与（研修給・時給など）。docs/keiri.md 3-3
  // 利益では人件費として引き、現金はその日に減る。まだ払っていないお金には入らない。
  {
    key: "payroll_daily",
    label: "人件費（当日払い）",
    side: "expense",
    fromExpenseText: true,
    mergeInto: "payroll",
  },
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
  { key: "lease", label: "賃借料（レンタル）", side: "expense", fromExpenseText: true },
  { key: "communication", label: "通信費", side: "expense", fromExpenseText: true },
  { key: "misc", label: "雑費", side: "expense", fromExpenseText: true },
];

/** 経費側の科目だけを、表示順で並べたもの */
export const EXPENSE_ACCOUNTS = ACCOUNTS.filter(
  (a) => a.side === "expense",
) as (AccountDef & { key: ExpenseAccountKey })[];

/**
 * 画面の表・グラフに出す経費の科目（まとめ先のあるものは出さない）。
 * 「人件費（当日払い）」は「人件費」の行にまとめて出すので、ここには入りません。
 */
export const DISPLAY_EXPENSE_ACCOUNTS = EXPENSE_ACCOUNTS.filter((a) => !a.mergeInto);

const BY_KEY = new Map(ACCOUNTS.map((a) => [a.key, a]));

/** 科目キーから表示名を引く。知らないキーはそのまま返す（画面を止めないため） */
export function accountLabel(key: AccountKey | string): string {
  return BY_KEY.get(key as AccountKey)?.label ?? String(key);
}

/**
 * CSV（仕訳）に書く科目の名前。
 * まとめ先があるものは、まとめ先の名前で書きます
 * （「人件費（当日払い）」→「人件費」。docs/keiri.md 6章）。
 */
export function accountLabelForCsv(key: AccountKey | string): string {
  const def = BY_KEY.get(key as AccountKey);
  if (def?.mergeInto) return accountLabel(def.mergeInto);
  return accountLabel(key);
}

/** 振り分け先が無かったときに使う科目（＝雑費） */
export const FALLBACK_ACCOUNT: ExpenseAccountKey = "misc";
