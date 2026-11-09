"use client";

/**
 * 加盟店（ゆうやさん）向け「今月の数字」の小さいカード（2026-11-09 じゅん決定）。
 *
 * トップの大きいボタンの下に1枚だけ出す。3行だけ：売上・経費・残り（10%を引いたあと）。
 * 日報を出すたびに増えるので「日報を出すと見られる」＝出すメリットにもなる。
 * 計算は lib/money.ts の calcFranchiseMonth（→ CLAUDE.md 4-1）。
 * 経費は明細を取らず expenses_total を読む（→ 4-2）。
 * ★手羽屋のときだけ出す。確かめているあいだは出さない（金額の出る枠のため → TebayaOnlyGate の説明）。
 */

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { calcFranchiseMonth, type FranchiseMonth } from "@/lib/money";
import { useIsTebaya } from "@/app/components/TebayaOnlyGate";

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

function monthRangeJst(): { start: string; end: string; m: number } {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}`, m };
}

export default function FranchiseMonthCard() {
  const { checking, isTebaya } = useIsTebaya();
  const [data, setData] = useState<FranchiseMonth | null>(null);
  const { start, end, m } = monthRangeJst();

  useEffect(() => {
    if (checking || !isTebaya) return;
    let alive = true;
    (async () => {
      try {
        const { data: rows, error } = await supabase
          .from("daily_reports")
          .select("sales_amount, expenses_total, labor")
          .is("tenant_id", null)
          .eq("shop", "手羽屋")
          .gte("date", start)
          .lte("date", end);
        if (error) throw error;
        if (alive) setData(calcFranchiseMonth(rows || []));
      } catch {
        // 読めなくてもトップは止めない（カードを出さないだけ）
      }
    })();
    return () => {
      alive = false;
    };
  }, [checking, isTebaya, start, end]);

  if (checking || !isTebaya || !data) return null;

  return (
    <section className="rounded-2xl bg-white border border-stone-200 px-5 py-4 shadow-sm">
      <p className="text-sm font-bold text-stone-500 mb-2">
        {m}月の数字（日報{data.days}日分）
      </p>
      <div className="flex justify-between text-base">
        <span className="text-stone-600">売上</span>
        <span className="font-bold">{yen(data.sales)}</span>
      </div>
      <div className="flex justify-between text-base">
        <span className="text-stone-600">経費</span>
        <span className="font-bold">{yen(data.expenses)}</span>
      </div>
      <div className="flex justify-between items-baseline text-lg pt-1 mt-1 border-t border-stone-100">
        <span className="text-stone-700">残り</span>
        <span className="text-2xl font-bold text-orange-600">{yen(data.remaining)}</span>
      </div>
      <p className="text-xs text-stone-400 mt-1">
        売上の10%（{yen(data.royalty)}）を引いたあと。手羽先の差額は月末の精算で引きます。
      </p>
    </section>
  );
}
