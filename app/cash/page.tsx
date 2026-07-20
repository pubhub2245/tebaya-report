"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen, slashDate, todayStr } from "@/lib/format";
import AdminGate from "@/app/components/AdminGate";

type CashSettings = {
  id: number;
  opening_balance: number;
  start_date: string | null; // YYYY-MM-DD / null=全期間
  memo: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

type ReportRow = {
  date: string;
  sales_amount: number | null;
  expenses: unknown;
};

/** expenses(jsonb 配列) から amount を積み上げる。expenses_total 列はバグのため使わない。 */
function sumExpenses(expenses: unknown): number {
  if (!Array.isArray(expenses)) return 0;
  return expenses.reduce((s: number, e: any) => s + (Number(e?.amount) || 0), 0);
}

export default function CashPage() {
  return (
    <AdminGate>
      <CashInner />
    </AdminGate>
  );
}

function CashInner() {
  const [settings, setSettings] = useState<CashSettings | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // cash_settings の最新1行（無ければ opening_balance=0 / start_date=null 扱い）
      const { data: s, error: sErr } = await supabase
        .from("cash_settings")
        .select("id, opening_balance, start_date, memo, updated_at, updated_by")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sErr) throw sErr;
      const current: CashSettings | null = (s as CashSettings) ?? null;
      setSettings(current);

      // 集計対象の日報（start_date 以降。null なら全期間）
      let query = supabase
        .from("daily_reports")
        .select("date, sales_amount, expenses");
      const startDate = current?.start_date ?? null;
      if (startDate) query = query.gte("date", startDate);
      const { data: reps, error: rErr } = await query;
      if (rErr) throw rErr;
      setReports((reps as ReportRow[]) ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openingBalance = settings?.opening_balance ?? 0;
  const startDate = settings?.start_date ?? null;

  const salesTotal = useMemo(
    () => reports.reduce((s, r) => s + (Number(r.sales_amount) || 0), 0),
    [reports],
  );
  const expensesTotal = useMemo(
    () => reports.reduce((s, r) => s + sumExpenses(r.expenses), 0),
    [reports],
  );
  const balance = openingBalance + salesTotal - expensesTotal;

  const periodLabel = startDate
    ? `${slashDate(startDate)} 〜 ${slashDate(todayStr())}`
    : `全期間 〜 ${slashDate(todayStr())}`;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">💰 現金残高</h1>
        <div className="flex gap-2">
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
          <Link href="/admin" className="btn-secondary text-sm">
            管理者ページ
          </Link>
        </div>
      </header>

      {error && (
        <div className="card text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
          ❌ 読込エラー: {error}
        </div>
      )}
      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {!loading && (
        <>
          {/* 残高カード */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 p-6 text-center">
            <div className="text-sm text-emerald-800 font-semibold">
              今、手元に残っている現金
            </div>
            <div
              className={`text-4xl font-extrabold font-mono mt-1 ${
                balance >= 0 ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {yen(balance)}
            </div>
            <div className="text-xs text-emerald-700 mt-2">
              集計期間：{periodLabel}
            </div>
          </div>

          {/* 内訳 */}
          <div className="card space-y-1 text-sm">
            <div className="flex justify-between text-stone-700">
              <span>開始残高</span>
              <span className="font-mono">{yen(openingBalance)}</span>
            </div>
            <div className="flex justify-between text-stone-700">
              <span>＋ 売上合計</span>
              <span className="font-mono">{yen(salesTotal)}</span>
            </div>
            <div className="flex justify-between text-stone-700">
              <span>− 経費合計</span>
              <span className="font-mono">−{yen(expensesTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-stone-300 pt-2 mt-1 font-bold">
              <span>= 手元現金</span>
              <span className="font-mono">{yen(balance)}</span>
            </div>
            <p className="text-[11px] text-stone-400 pt-1">
              ※ 対象は日報{reports.length}件（起点日以降）。売上は日報の売上、経費は日報の立替経費の明細から集計しています。
            </p>
          </div>

          {/* 設定 */}
          <SettingsForm settings={settings} onSaved={load} />
        </>
      )}
    </main>
  );
}

/* ---------- 開始残高・起点日の設定 ---------- */
function SettingsForm({
  settings,
  onSaved,
}: {
  settings: CashSettings | null;
  onSaved: () => void;
}) {
  const [openOpen, setOpenOpen] = useState(false);
  const [balance, setBalance] = useState<number>(settings?.opening_balance ?? 0);
  const [startDate, setStartDate] = useState<string>(settings?.start_date ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  // settings が読み込まれたらフォーム初期値を同期
  useEffect(() => {
    setBalance(settings?.opening_balance ?? 0);
    setStartDate(settings?.start_date ?? "");
  }, [settings]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        opening_balance: balance,
        start_date: startDate || null, // 空欄なら全期間
        updated_at: new Date().toISOString(),
        updated_by: "管理者",
      };
      if (settings?.id) {
        const { error } = await supabase
          .from("cash_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cash_settings").insert(payload);
        if (error) throw error;
      }
      setMsg({ kind: "ok", text: "保存しました" });
      onSaved();
      setOpenOpen(false);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  if (!openOpen) {
    return (
      <button
        type="button"
        onClick={() => setOpenOpen(true)}
        className="text-xs text-stone-500 underline"
      >
        ⚙️ 開始残高・起点日を設定する
      </button>
    );
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
      <h3 className="font-bold text-amber-900">⚙️ 開始残高・起点日の設定</h3>
      <p className="text-xs text-amber-800 leading-relaxed">
        「起点日」の朝の時点で手元にあった現金を「開始残高」に入れてください。
        この日以降の売上・経費が自動で足し引きされます。（起点日を空欄にすると全期間を集計します）
      </p>
      <div>
        <label className="label">起点日</label>
        <input
          type="date"
          className="field"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      <div>
        <label className="label">開始残高</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
            ¥
          </span>
          <input
            type="number"
            inputMode="numeric"
            className="field pl-8 text-right text-xl font-bold"
            value={balance || ""}
            onChange={(e) =>
              setBalance(Math.max(0, parseInt(e.target.value || "0", 10)))
            }
            placeholder="0"
          />
        </div>
      </div>
      {msg && (
        <div
          className={`text-sm font-semibold rounded-xl px-3 py-2 ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.kind === "ok" ? "✅" : "❌"} {msg.text}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpenOpen(false)}
          disabled={saving}
          className="btn-secondary flex-1"
        >
          閉じる
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary flex-[2]"
        >
          {saving ? "保存中…" : "保存する"}
        </button>
      </div>
    </div>
  );
}
