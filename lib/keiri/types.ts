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
