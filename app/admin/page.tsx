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
  register_diff: number | null;
  expenses: { description: string; amount: number }[] | null;
};

type Alert = {
  staff: string;
  date1: string;
  amount1: number;
  date2: string;
  amount2: number;
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
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (r: Report) => {
    if (
      !confirm(
        `この日報を削除しますか？\n${slashDate(r.date)} / ${r.location} / ${r.staff_name}`
      )
    )
      return;
    setDeletingId(r.id);
    try {
      const { error } = await supabase
        .from("daily_reports")
        .delete()
        .eq("id", r.id);
      if (error) throw error;
      setReports((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message || e));
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [recentRes, allRes] = await Promise.all([
          supabase
            .from("daily_reports")
            .select(
              "id, date, location, staff_name, sales_amount, register_diff, expenses"
            )
            .order("date", { ascending: false })
            .limit(30),
          supabase
            .from("daily_reports")
            .select("date, staff_name, register_diff")
            .order("date", { ascending: true }),
        ]);
        if (recentRes.error) throw recentRes.error;
        if (allRes.error) throw allRes.error;
        setReports((recentRes.data as Report[]) || []);

        const byStaff = new Map<
          string,
          { date: string; register_diff: number | null }[]
        >();
        ((allRes.data as any[]) || []).forEach((r) => {
          const arr = byStaff.get(r.staff_name) || [];
          arr.push({ date: r.date, register_diff: r.register_diff });
          byStaff.set(r.staff_name, arr);
        });
        const found: Alert[] = [];
        byStaff.forEach((rows, staff) => {
          for (let i = 0; i < rows.length - 1; i++) {
            const a = rows[i];
            const b = rows[i + 1];
            if ((a.register_diff ?? 0) < 0 && (b.register_diff ?? 0) < 0) {
              found.push({
                staff,
                date1: a.date,
                amount1: a.register_diff as number,
                date2: b.date,
                amount2: b.register_diff as number,
              });
            }
          }
        });
        setAlerts(found);
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
    const takeHome = inMonth.reduce((s, r) => {
      const expTotal = (r.expenses || []).reduce(
        (e, x) => e + (x.amount || 0),
        0
      );
      return s + ((r.sales_amount || 0) - expTotal);
    }, 0);
    return {
      sales,
      profit,
      takeHome,
      count: inMonth.length,
      label: `${y}年${m + 1}月`,
    };
  }, [reports]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-dark">管理者ページ</h1>
        <Link href="/" className="btn-secondary text-sm">
          日報フォームへ
        </Link>
      </header>

      {alerts.length > 0 && (
        <section className="space-y-3">
          {alerts.map((a, i) => {
            const total = a.amount1 + a.amount2;
            return (
              <div
                key={i}
                className="border-2 border-red-400 bg-red-50 rounded-xl p-4 text-red-800"
              >
                <div className="font-bold text-lg mb-1">
                  ⚠️ {a.staff}：2回連続レジマイナス
                </div>
                <div className="text-sm">
                  {slashDate(a.date1)}：{a.amount1.toLocaleString("ja-JP")}円
                  {" / "}
                  {slashDate(a.date2)}：{a.amount2.toLocaleString("ja-JP")}円
                </div>
                <div className="mt-2 font-bold">
                  補填金額：{Math.abs(total).toLocaleString("ja-JP")}円
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <div className="text-xs text-stone-500">
            {monthStats.label} 持ち帰り金額合計
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {yen(monthStats.takeHome)}
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
                <th className="py-2 pr-3 text-right">粗利</th>
                <th className="py-2 pr-3 text-right">持ち帰り</th>
                <th className="py-2 pr-3 text-right">レジ差異</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const profit = calcProfit(r.sales_amount || 0, r.expenses);
                const expTotal = (r.expenses || []).reduce(
                  (s, e) => s + (e.amount || 0),
                  0
                );
                const takeHome = (r.sales_amount || 0) - expTotal;
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
                      className={`py-2 pr-3 text-right font-mono ${
                        profit >= 0 ? "" : "text-red-600"
                      }`}
                    >
                      {yen(profit)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-orange-600">
                      {yen(takeHome)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {(r.register_diff ?? 0) === 0 ? (
                        <span className="text-stone-400">－</span>
                      ) : (
                        <span className="text-red-600">
                          {yen(r.register_diff ?? 0)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r.id}
                        className="text-red-600 hover:text-red-700 border border-red-300 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-40"
                      >
                        {deletingId === r.id ? "削除中…" : "削除"}
                      </button>
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
