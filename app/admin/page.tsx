"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen, slashDate } from "@/lib/format";

type Report = {
  id: string;
  date: string;
  location: string;
  staff_name: string;
  sales_amount: number;
  expenses: { description: string; amount: number }[] | null;
};

const calcProfit = (sales: number, expenses: Report["expenses"]) => {
  const food = Math.round(sales * 0.25);
  const labor = 10000;
  const rent = Math.round(sales * 0.1);
  const expTotal = (expenses || []).reduce(
    (s, e) => s + (e.amount || 0),
    0
  );
  return sales - (food + labor + rent + expTotal);
};

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("daily_reports")
          .select(
            "id, date, location, staff_name, sales_amount, expenses"
          )
          .order("date", { ascending: false })
          .limit(30);
        if (error) throw error;
        setReports((data as Report[]) || []);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const monthStats = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startIso = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const endDate = new Date(y, m + 1, 0).getDate();
    const endIso = `${y}-${String(m + 1).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
    const inMonth = reports.filter(
      (r) => r.date >= startIso && r.date <= endIso
    );
    const sales = inMonth.reduce(
      (s, r) => s + (r.sales_amount || 0),
      0
    );
    const profit = inMonth.reduce(
      (s, r) => s + calcProfit(r.sales_amount || 0, r.expenses),
      0
    );
    return { sales, profit, count: inMonth.length, label: `${y}年${m + 1}月` };
  }, [reports]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-dark">管理者ページ</h1>
        <Link href="/" className="btn-secondary text-sm">
          日報フォームへ
        </Link>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card">
          <div className="text-xs text-stone-500">{monthStats.label} 売上合計</div>
          <div className="text-2xl font-bold text-brand-dark">
            {yen(monthStats.sales)}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">{monthStats.label} 粗利合計</div>
          <div
            className={`text-2xl font-bold ${
              monthStats.profit >= 0 ? "text-brand-dark" : "text-red-600"
            }`}
          >
            {yen(monthStats.profit)}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">{monthStats.label} 日報件数</div>
          <div className="text-2xl font-bold">{monthStats.count}件</div>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-lg font-bold mb-3">直近30件の日報</h2>
        {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
        {error && <p className="text-sm text-red-600">エラー: {error}</p>}
        {!loading && !error && reports.length === 0 && (
          <p className="text-sm text-stone-500">データがありません</p>
        )}
        {!loading && !error && reports.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-stone-200">
                <th className="py-2 pr-3">日付</th>
                <th className="py-2 pr-3">場所</th>
                <th className="py-2 pr-3">担当</th>
                <th className="py-2 pr-3 text-right">売上</th>
                <th className="py-2 text-right">粗利</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const profit = calcProfit(r.sales_amount || 0, r.expenses);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-stone-100 last:border-b-0"
                  >
                    <td className="py-2 pr-3">{slashDate(r.date)}</td>
                    <td className="py-2 pr-3">{r.location}</td>
                    <td className="py-2 pr-3">{r.staff_name}</td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {yen(r.sales_amount || 0)}
                    </td>
                    <td
                      className={`py-2 text-right font-mono ${
                        profit >= 0 ? "" : "text-red-600"
                      }`}
                    >
                      {yen(profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
