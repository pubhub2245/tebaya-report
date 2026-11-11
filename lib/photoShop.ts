/**
 * 「写真だけの日報」を使う、手羽屋以外のお店（2026-11-11 追加・じゅん決定）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   牟田町のテイクアウト店は、雄大さんが**独立**で運営します（加盟店ではありません）。
 *   雄大さんが気にしているのは「原価率」と「結局いくら残るか」なので、
 *   毎日の作業は写真を撮るだけにして、今月いくら残っているかを1画面で見せます。
 *
 * ■ ゆうやさん（手羽屋）との違い
 *   ・場所は1つで固定（場所を選ぶ画面を出さない）
 *   ・場代・本部イベント・月の精算・ロイヤリティは無い
 *   ・LINE は送らない（手羽屋のスタッフのグループに、よその店の数字を流さないため）
 *   ・家賃や電気・水道のような「毎月かならず出ていくお金」をここに持つ
 *
 * ■ 手羽屋は1つも変わりません
 *   ここに載っているお店の番号のときだけ動きます。手羽屋（印が空）と、
 *   経理パッケージのほかのお店は、いままでどおりです。
 *
 * ★ 計算だけ（倉庫は触りません）。tests/photoShop.test.ts で固定。
 * ★ お店を足す・家賃を変えるときは、この一覧を直す（必要最低限から。画面で変える作りは後回し）。
 */

import { normalizeTenantScope, type TenantScope } from "./tenantScope";

export type FixedCost = { label: string; amount: number };

export type PhotoShop = {
  /** お店の番号（keiri_tenants.id） */
  tenantId: string;
  shopName: string;
  /** 出店場所（1つで固定） */
  location: string;
  /** 日報の担当に入る名前 */
  staffName: string;
  /** 毎月かならず出ていくお金（レシートで入ってこないもの） */
  monthlyFixed: FixedCost[];
  /** 1日の人件費の初期値（最後の確認で直せる） */
  defaultLaborPerDay: number;
  /** 月の営業日数の予定（月末の見込みに使う） */
  plannedDays: number;
  /** 赤字にならない目安（1日の手羽先の本数）。収支計画の資料と同じ数字 */
  breakEvenPerDay: number;
  /** 本数を数える主力商品の名前 */
  primaryProduct: string;
};

/** 牟田町店（雄大さん） */
export const MUTA_SHOP: PhotoShop = {
  tenantId: "bec74fef-6293-4c50-8c1c-a8d77bc34262",
  shopName: "牟田町店",
  location: "牟田町店",
  staffName: "牟田町店",
  monthlyFixed: [
    { label: "家賃", amount: 35000 },
    { label: "電気", amount: 3500 },
    { label: "水道", amount: 3000 },
  ],
  // 時給1,100円 × 6時間（収支計画の資料の前提）
  defaultLaborPerDay: 6600,
  plannedDays: 20,
  breakEvenPerDay: 43,
  primaryProduct: "手羽先",
};

export const PHOTO_SHOPS: PhotoShop[] = [MUTA_SHOP];

/** いま開いているお店が「写真だけの日報」のお店なら、その決まりを返す。違えば null */
export function photoShopFor(scope: TenantScope): PhotoShop | null {
  const id = normalizeTenantScope(scope);
  if (!id) return null;
  return PHOTO_SHOPS.find((s) => s.tenantId === id) ?? null;
}

export type ShopMonthRow = {
  sales_amount?: number | null;
  expenses_total?: number | null;
  labor?: number | null;
  product_counts?: Record<string, unknown> | null;
};

export type ShopMonth = {
  /** 日報の枚数（＝営業した日数） */
  days: number;
  sales: number;
  /** レシートで入った経費（仕入れ・ガスなど） */
  expenses: number;
  labor: number;
  /** 毎月かならず出ていくお金の合計 */
  fixed: number;
  /** いま残っているお金（売上 − 経費 − 人件費 − 固定費）。固定費は月の初めから全額引く */
  remaining: number;
  /** 売上に対する経費（レシート分）の割合。売上が0なら null */
  expenseRate: number | null;
  /** 1日平均の主力商品の本数。日報が無ければ null */
  avgPrimaryPerDay: number | null;
  /** このペースで予定の日数だけ営業したときの月末の見込み。日報が無ければ null */
  forecast: number | null;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * 今月の数字をまとめる。
 * ★数字を作らない：日報が1枚も無いときは、見込み・平均・割合を null で返す。
 */
export function calcShopMonth(rows: ShopMonthRow[], shop: PhotoShop): ShopMonth {
  const days = rows.length;
  const sales = rows.reduce((s, r) => s + n(r.sales_amount), 0);
  const expenses = rows.reduce((s, r) => s + n(r.expenses_total), 0);
  const labor = rows.reduce((s, r) => s + n(r.labor), 0);
  const fixed = shop.monthlyFixed.reduce((s, f) => s + f.amount, 0);
  const primary = rows.reduce((s, r) => s + n(r.product_counts?.[shop.primaryProduct]), 0);
  const beforeFixed = sales - expenses - labor;
  return {
    days,
    sales,
    expenses,
    labor,
    fixed,
    remaining: beforeFixed - fixed,
    expenseRate: sales > 0 ? expenses / sales : null,
    avgPrimaryPerDay: days > 0 ? Math.round(primary / days) : null,
    forecast:
      days > 0 ? Math.round((beforeFixed / days) * Math.max(shop.plannedDays, days)) - fixed : null,
  };
}
