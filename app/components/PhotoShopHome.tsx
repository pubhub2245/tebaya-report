"use client";

/**
 * 「写真だけの日報」のお店（牟田町店など）のホームと、今月の数字（2026-11-11 追加）。
 *
 * ・ホーム：大きい「写真で日報を出す」と、「今月いま残っているお金」の1枚だけ。
 * ・数字の計算は lib/photoShop.ts の calcShopMonth の1か所（tests/photoShop.test.ts）。
 * ・読むのは**そのお店の印が付いた日報だけ**。集計なので経費の明細は読まない（CLAUDE.md 4-2）。
 * ・手羽屋・経理パッケージのお店には何も出さない。
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { applyTenantScope } from "@/lib/tenantScope";
import { currentShopScope } from "@/lib/keiri/readSource";
import { calcShopMonth, photoShopFor, type PhotoShop, type ShopMonth } from "@/lib/photoShop";

export const yen = (n: number) => `${n < 0 ? "−" : ""}${Math.round(Math.abs(n)).toLocaleString("ja-JP")}円`;

/** いまの端末が「写真だけの日報」のお店かどうか */
export function usePhotoShop(): { checking: boolean; shop: PhotoShop | null } {
  const [checking, setChecking] = useState(true);
  const [shop, setShop] = useState<PhotoShop | null>(null);
  useEffect(() => {
    setShop(photoShopFor(currentShopScope()));
    setChecking(false);
  }, []);
  return { checking, shop };
}

/** 「写真だけの日報」のお店のときは中身を出さない（経理パッケージ向けのメニューを隠す） */
export function NotPhotoShopBlock({ children }: { children: React.ReactNode }) {
  const { checking, shop } = usePhotoShop();
  if (checking || shop) return null;
  return <>{children}</>;
}

function monthRangeJst(): { start: string; end: string; m: number } {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}`, m };
}

export type ShopMonthState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; month: ShopMonth; m: number };

/** 今月の数字を読む（そのお店の日報だけ） */
export function useShopMonth(shop: PhotoShop | null): ShopMonthState {
  const [state, setState] = useState<ShopMonthState>({ kind: "loading" });
  useEffect(() => {
    if (!shop) return;
    let alive = true;
    const { start, end, m } = monthRangeJst();
    (async () => {
      try {
        const { data, error } = await applyTenantScope<any>(
          supabase
            .from("daily_reports")
            .select("sales_amount, expenses_total, labor, product_counts") as any,
          shop.tenantId,
        )
          .gte("date", start)
          .lte("date", end);
        if (error) throw error;
        if (alive) setState({ kind: "ok", month: calcShopMonth(data || [], shop), m });
      } catch {
        if (alive) setState({ kind: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [shop]);
  return state;
}

export function PhotoShopHome() {
  const { checking, shop } = usePhotoShop();
  const state = useShopMonth(shop);
  if (checking || !shop) return null;
  const month = state.kind === "ok" ? state.month : null;

  return (
    <section className="flex-1 flex flex-col justify-center gap-5 py-6">
      <Link
        href="/report/photo"
        className="flex flex-col items-center justify-center gap-2 w-full h-48 rounded-3xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold shadow-lg transition"
      >
        <span className="text-6xl">📷</span>
        <span className="text-3xl">写真で日報を出す</span>
        <span className="text-sm font-normal">伝票とレシートを撮るだけ</span>
      </Link>

      <Link
        href="/month"
        className="block rounded-2xl bg-white border border-stone-200 px-5 py-4 shadow-sm active:border-orange-500"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-stone-500">今月いま残っているお金</span>
          <span className="text-sm font-bold text-orange-600">くわしく見る →</span>
        </div>
        {state.kind === "loading" && <p className="text-sm text-stone-400 mt-2">読み込み中…</p>}
        {state.kind === "error" && (
          <p className="text-sm text-red-600 mt-2">読めませんでした。電波を確かめて開き直してください。</p>
        )}
        {month && month.days === 0 && (
          <p className="text-sm text-stone-500 mt-2">今月の日報はまだありません。最初の1枚を出すとここに出ます。</p>
        )}
        {month && month.days > 0 && (
          <>
            <p className={`text-4xl font-bold mt-1 ${month.remaining >= 0 ? "text-green-700" : "text-red-600"}`}>
              {yen(month.remaining)}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              売上 {yen(month.sales)}・日報{month.days}日分
            </p>
          </>
        )}
      </Link>

      <Link
        href="/report/edit"
        className="flex items-center justify-center gap-3 w-full h-16 rounded-3xl bg-white border-2 border-stone-200 active:border-orange-500 text-stone-700 font-bold text-lg shadow-sm transition"
      >
        <span className="text-xl">📖</span>
        <span>過去の日報を見る</span>
      </Link>

      <Link
        href="/supplies"
        className="flex items-center justify-center gap-3 w-full h-16 rounded-3xl bg-white border-2 border-stone-200 active:border-orange-500 text-stone-700 font-bold text-lg shadow-sm transition"
      >
        <span className="text-xl">🛒</span>
        <span>使う備品・材料を見る</span>
      </Link>
    </section>
  );
}
