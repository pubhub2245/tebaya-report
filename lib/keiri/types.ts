/**
 * 経理パッケージが受け取るデータの形。共通部分。
 *
 * ★ここには「手羽屋」という言葉を出さないこと。
 *   業態ごとの中身は lib/keiri/templates/ に入れる。
 */

import type { ExpenseAccountKey } from "./accounts";

/** 経費の明細1件（日報の expenses jsonb の1要素） */
export type ExpenseItem = {
  description?: string | null;
  amount?: number | null;
  receipt_image_url?: string | null;
};

/** 集計に使う日報1件ぶん */
export type KeiriReport = {
  /** 計上日（YYYY-MM-DD）。★入力日時ではなく、この営業日で数える（現金主義） */
  date: string;
  /** 出店場所（空のこともある） */
  location?: string | null;
  /** 担当者 */
  staff_name?: string | null;
  /** その日の売上（円） */
  sales_amount?: number | null;
  /** その日の給与（日当・円）。日報1件ぶんの合計 */
  labor?: number | null;
  /** 経費の明細 */
  expenses?: unknown;
};

/** 実際に払った記録（keiri_payments の1行） */
export type KeiriPayment = {
  /** 支払日（YYYY-MM-DD） */
  paid_on: string;
  /** 金額（円） */
  amount: number;
  /** 種別：payroll＝給与 ／ outsourcing＝外注費 ／ rent＝家賃 */
  kind: PaymentKind;
  memo?: string | null;
};

/**
 * 「発生」と「支払い」がズレる科目の種別。
 * ★この3つだけが支払い記録の対象。ほかの経費はレジから払った時点で現金が減る。
 */
export type PaymentKind = "payroll" | "outsourcing" | "rent";

/** 支払い種別の表示名（画面には専門用語を出さない） */
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  payroll: "給与",
  outsourcing: "外注費（Alpha）",
  rent: "家賃（事務所）",
};

/** 支払い種別 → 科目キー（CSVや集計で使う） */
export const PAYMENT_KIND_ACCOUNT: Record<PaymentKind, ExpenseAccountKey> = {
  payroll: "payroll",
  outsourcing: "outsourcing",
  rent: "rent",
};

/** 経理の設定（keiri_settings の1行） */
export type KeiriSettings = {
  /** 数え始めの日（期首日・YYYY-MM-DD） */
  opening_date: string;
  /** 数え始めの日の現金（期首残高・円） */
  opening_balance: number;
  /** 外注費の率。0.1 = 売上高の10% */
  outsourcing_rate: number;
  /** 事務所の毎月の家賃（円） */
  monthly_rent: number;
  /** 家賃を数え始める月（YYYY-MM）。この月より前の月は家賃0円 */
  rent_start_month: string;
};

/** 振り分けのルール1つ（この言葉が含まれていたら、この科目） */
export type ExpenseRule = {
  account: ExpenseAccountKey;
  /** 判定に使う言葉。ひとつでも含まれていれば当たり */
  keywords: string[];
};

/**
 * 業態テンプレート。業態（お店の種類）ごとに1つ作る。
 * これを差し替えるだけで、同じ集計ロジックを別の業態で使える。
 */
export type BusinessTemplate = {
  /** 業態コード。DBの business_type_code と合わせる */
  code: string;
  /** 画面に出す業態名 */
  label: string;
  /**
   * 経費の自由入力の文字 → 科目 の対応表。
   * ★上から順に見て、最初に当たったものを採用する（順番が意味を持つ）。
   */
  expenseRules: ExpenseRule[];
};

/* ------------------------------------------------------------------ *
 *  立替（たてかえ）
 * ------------------------------------------------------------------ */

/**
 * 立替がどの入口から入ったか。
 *   "field" … 現場スタッフの立替（keiri_advance_expenses・/keiri/advances）
 *   "owner" … 経営側の立替（advance_expenses・/cash/advances）
 * ★画面の説明に出すだけで、計算は変わりません（CLAUDE.md 5-4 の「3つの箱」）。
 */
export type AdvanceSource = "field" | "owner";

/**
 * 立替1件（誰かが自分のお金で先に払った経費）。
 *
 * ■ なぜ月の経費に入れるのか（2026-10-02・kp218）
 *   それまで経理の月次は「レジのお金から出た経費」だけを数えていました。
 *   ところが実データでは、出店料 385,000円のような**実際に出た費用が
 *   まるごと立替**で、金庫からは1円も出ていないことがあります。
 *   そのままだと月の経費が2つの数字に分かれ（金庫から出た分／立替も含めた全部）、
 *   お店に渡す1枚の要約に書く数字が決まりません。
 *   そこで **月の経費は「立替も含めた全部」1つに決めました**。
 *   金庫から出た分も消さずに `expenseFromRegister` として残します。
 *
 * ■ 現金はこの日には減りません
 *   立て替えた日に減るのは立て替えた人の財布で、お店の金庫ではありません。
 *   金庫から出るのは**返した（精算した）日**です。だから
 *   ・まだ返していない立替 … 「まだ払っていないお金」に入る
 *   ・返した立替　　　　　 … その日に「今の現金」から引く
 */
export type KeiriAdvance = {
  /** 立て替えた日（YYYY-MM-DD）。経費として数えるのはこの日 */
  date: string;
  /** 金額（円） */
  amount: number;
  /** 何に使ったか。科目はこの文字から当てる（日報の経費とまったく同じ当て方） */
  description?: string | null;
  /** 立て替えた人 */
  payer?: string | null;
  /** 返した（精算した）か。false／未設定＝まだ返していない */
  settled?: boolean | null;
  /** 返した日（YYYY-MM-DD）。現金から引くのはこの日 */
  settledDate?: string | null;
  /** どの入口から入ったか（説明に出すだけ） */
  source?: AdvanceSource;
  /**
   * 科目をあらかじめ決めておく場合に入れる。
   * 現場の立替は「種類」を選ぶ形なので、文字から当てるより確かです。
   */
  account?: ExpenseAccountKey | null;
  /**
   * 月の経費に**数えない**理由。入っていたら合計に足しません。
   * 勝手に捨てるのではなく、画面に理由つきで出して人が見られるようにします。
   */
  skipReason?: string | null;
};
