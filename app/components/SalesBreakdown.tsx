"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";

/**
 * ② 売上サマリー: 店別（手羽屋/もも屋）と場所別の売上内訳。
 * 指定月の daily_reports を集計して表示する（読み取り専用）。
 */

type Row = {
  shop: string | null;
  location: string | null;
  sales_amount: number | null;
};

const SHOP_STYLE: Record<string, string> = {
  手羽屋: "bg-orange-100 text-orange-800 border-orange-200",
  もも屋: "bg-rose-100 text-rose-800 border-rose-200",
};
const shopStyle = (shop: string) =>
  SHOP_STYLE[shop] ?? "bg-stone-100 text-stone-700 border-stone-200";

function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export default function SalesBreakdown({ yearMonth }: { yearMonth: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("daily_reports")
        .select("shop, location, sales_amount")
        .gte("date", `${yearMonth}-01`)
        .lte("date", `${yearMonth}-31`);
      if (cancelled) return;
      if (error) setError(error.message);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [yearMonth]);

  const { byShop, byLocation, total } = useMemo(() => {
    const shopMap = new Map<string, { sales: number; count: number }>();
    const locMap = new Map<
      string,
      { sales: number; count: number; shops: Set<string> }
    >();
    let total = 0;
    for (const r of rows) {
      const shop = r.shop || "手羽屋";
      const loc = r.location || "（場所未入力）";
      const sales = r.sales_amount || 0;
      total += sales;

      const sEntry = shopMap.get(shop) ?? { sales: 0, count: 0 };
      sEntry.sales += sales;
      sEntry.count += 1;
      shopMap.set(shop, sEntry);

      const lEntry = locMap.get(loc) ?? { sales: 0, count: 0, shops: new Set() };
      lEntry.sales += sales;
      lEntry.count += 1;
      lEntry.shops.add(shop);
      locMap.set(loc, lEntry);
    }
    const byShop = Array.from(shopMap.entries())
      .map(([shop, v]) => ({ shop, ...v }))
      .sort((a, b) => b.sales - a.sales);
    const byLocation = Array.from(locMap.entries())
      .map(([location, v]) => ({ location, ...v, shops: Array.from(v.shops) }))
      .sort((a, b) => b.sales - a.sales);
    return { byShop, byLocation, total };
  }, [rows]);

  return (
    <div className="card space-y-4">
      <h3 className="text-base font-bold">🏪 店別・場所別の売上</h3>

      {error && <p className="text-sm text-red-600">エラー: {error}</p>}
      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-stone-400">この月の日報がありません。</p>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* 店別 */}
          <div className="grid grid-cols-2 gap-2">
            {byShop.map((s) => (
              <div
                key={s.shop}
                className={`rounded-xl border p-3 ${shopStyle(s.shop)}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{s.shop}</span>
                  <span className="text-xs opacity-80">{pct(s.sales, total)}</span>
                </div>
                <div className="text-xl font-extrabold font-mono mt-1">
                  {yen(s.sales)}
                </div>
                <div className="text-xs opacity-80">{s.count}日</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center text-sm border-t border-stone-100 pt-2">
            <span className="font-bold text-stone-700">合計売上</span>
            <span className="font-extrabold font-mono text-brand-dark">
              {yen(total)}
            </span>
          </div>

          {/* 場所別ランキング */}
          <div>
            <p className="text-sm font-bold text-stone-700 mb-2">
              場所別ランキング
            </p>
            <div className="space-y-1">
              {byLocation.map((l, i) => (
                <div
                  key={l.location}
                  className="flex items-center gap-2 text-sm py-1 border-b border-stone-50 last:border-0"
                >
                  <span
                    className={`w-6 text-center font-bold shrink-0 ${
                      i < 3 ? "text-brand-dark" : "text-stone-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">
                    {l.location}
                    {l.shops.length === 1 && l.shops[0] !== "手羽屋" && (
                      <span className="ml-1 text-xs text-rose-600">
                        （{l.shops[0]}）
                      </span>
                    )}
                    {l.shops.length > 1 && (
                      <span className="ml-1 text-xs text-stone-400">
                        （{l.shops.join("・")}）
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-stone-400 shrink-0">
                    {l.count}日
                  </span>
                  <span className="font-mono font-bold text-stone-800 shrink-0 w-24 text-right">
                    {yen(l.sales)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-stone-400">
            ※ 日報の売上を店・場所ごとに合計しています。同じ日に手羽屋＋もも屋を出した場合は、それぞれの店に計上されます。
          </p>
        </>
      )}
    </div>
  );
}
