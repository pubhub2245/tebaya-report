"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen, slashDate, todayStr } from "@/lib/format";
import AdminGate from "@/app/components/AdminGate";

/**
 * 手羽屋「売上報告」画面（フェアリー精算の売上報告タブ相当）。
 * お店・日付ごとに 売上/経費/残り/手元合計 を集計し、
 * 日次レポート文を生成して LINE 業務グループへ送信できる。
 * 既存データ（daily_reports / cash_settings / advance_expenses）の集計のみ。
 */

const SHOPS = ["手羽屋", "もも屋"] as const;
const SEP = "━━━━━━━━━━";

type ExpenseItem = { description?: string; amount?: number };

type ReportRow = {
  date: string;
  shop: string | null;
  sales_amount: number | null;
  expenses: ExpenseItem[] | null;
  location: string | null;
  staff_name: string | null;
  register_diff: number | null;
  remaining_tebasaki: number | null;
  allstar_count: number | null;
  customer_groups: number | null;
  alcohol_count: number | null;
  product_counts: Record<string, number> | null;
};

type AdvanceRow = {
  amount: number;
  settled: boolean;
  settled_date: string | null;
  date: string;
};

function sumExpenses(expenses: ExpenseItem[] | null): number {
  if (!Array.isArray(expenses)) return 0;
  return expenses.reduce((s, e) => s + (Number(e?.amount) || 0), 0);
}

export default function SalesReportPage() {
  return (
    <AdminGate>
      <SalesReportInner />
    </AdminGate>
  );
}

function SalesReportInner() {
  const [shop, setShop] = useState<string>("手羽屋");
  const [date, setDate] = useState<string>(todayStr());
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sendMsg, setSendMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [repRes, setRes, advRes] = await Promise.all([
        supabase
          .from("daily_reports")
          .select(
            "date, shop, sales_amount, expenses, location, staff_name, register_diff, remaining_tebasaki, allstar_count, customer_groups, alcohol_count, product_counts",
          ),
        supabase
          .from("cash_settings")
          .select("opening_balance, start_date")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("advance_expenses")
          .select("amount, settled, settled_date, date"),
      ]);
      if (repRes.error) throw repRes.error;
      setReports((repRes.data as ReportRow[]) ?? []);
      setOpeningBalance((setRes.data as any)?.opening_balance ?? 0);
      setStartDate((setRes.data as any)?.start_date ?? null);
      setAdvances((advRes.data as AdvanceRow[]) ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // その日・その店の日報
  const dayReports = useMemo(
    () =>
      reports.filter(
        (r) => r.date === date && (r.shop ?? "手羽屋") === shop,
      ),
    [reports, date, shop],
  );

  const salesTotal = useMemo(
    () => dayReports.reduce((s, r) => s + (Number(r.sales_amount) || 0), 0),
    [dayReports],
  );
  const expensesTotal = useMemo(
    () => dayReports.reduce((s, r) => s + sumExpenses(r.expenses), 0),
    [dayReports],
  );
  const zan = salesTotal - expensesTotal;

  // 手元合計（累計・全店：/cash と同じ計算）
  const tegankei = useMemo(() => {
    const inPeriod = (d: string) => !startDate || d >= startDate;
    const salesAll = reports
      .filter((r) => inPeriod(r.date))
      .reduce((s, r) => s + (Number(r.sales_amount) || 0), 0);
    const expAll = reports
      .filter((r) => inPeriod(r.date))
      .reduce((s, r) => s + sumExpenses(r.expenses), 0);
    const settledAdv = advances
      .filter((a) => a.settled)
      .filter((a) => inPeriod(a.settled_date || a.date))
      .reduce((s, a) => s + (Number(a.amount) || 0), 0);
    return openingBalance + salesAll - expAll - settledAdv;
  }, [reports, advances, openingBalance, startDate]);

  const reportText = useMemo(
    () => buildReportText(shop, date, dayReports, zan, tegankei),
    [shop, date, dayReports, zan, tegankei],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const send = async () => {
    if (!window.confirm("この売上報告をLINE業務グループへ送信しますか？")) return;
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/line/send-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: reportText }),
      });
      const json = await res.json();
      if (json.ok) {
        setSendMsg({ kind: "ok", text: "送信しました" });
      } else {
        setSendMsg({
          kind: "err",
          text: "送信に失敗しました（LINE設定をご確認ください）",
        });
      }
    } catch (e: any) {
      setSendMsg({ kind: "err", text: "通信エラー: " + (e?.message || e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">💹 売上報告</h1>
        <div className="flex gap-2">
          <Link href="/cash" className="btn-secondary text-sm">
            💰 現金残高
          </Link>
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
        </div>
      </header>

      {/* お店切替＋日付 */}
      <div className="flex gap-2 items-center">
        <div className="flex rounded-lg border border-stone-300 overflow-hidden flex-1">
          {SHOPS.map((s) => (
            <button
              key={s}
              onClick={() => setShop(s)}
              className={`flex-1 text-sm py-2 font-bold ${
                shop === s ? "bg-brand text-white" : "bg-white text-stone-600"
              }`}
            >
              {s === "もも屋" ? "🍖 もも屋" : "🍗 手羽屋"}
            </button>
          ))}
        </div>
        <input
          type="date"
          className="field w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {error && (
        <div className="card text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
          ❌ {error}
        </div>
      )}
      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {!loading && (
        <>
          {/* 4カード */}
          <div className="grid grid-cols-2 gap-3">
            <Card label="売上合計" value={yen(salesTotal)} tone="teal" />
            <Card label="経費合計" value={yen(expensesTotal)} />
            <Card label="残り" value={yen(zan)} />
            <Card label="手元合計" value={yen(tegankei)} tone="teal" big />
          </div>

          {/* 日次売上レポート */}
          <div className="card space-y-3">
            <h2 className="text-lg font-bold text-brand-dark">日次売上レポート</h2>
            <p className="text-xs text-stone-500">
              下の「売上報告グループへ送信」で、LINEの業務グループへそのまま投稿できます。
            </p>
            <pre className="whitespace-pre-wrap break-words text-sm bg-stone-50 border border-stone-200 rounded-xl p-3 font-sans">
              {reportText}
            </pre>
            {sendMsg && (
              <div
                className={`text-sm font-semibold rounded-xl px-3 py-2 ${
                  sendMsg.kind === "ok"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {sendMsg.kind === "ok" ? "✅" : "❌"} {sendMsg.text}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={copy} className="btn-secondary flex-1">
                {copied ? "✅ コピーしました" : "📋 コピー"}
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="btn-primary flex-[2]"
              >
                {sending ? "送信中…" : "📤 売上報告グループへ送信"}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Card({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: "teal";
  big?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 border ${
        tone === "teal"
          ? "bg-emerald-50 border-emerald-200"
          : "bg-white border-stone-200"
      }`}
    >
      <div className="text-xs text-stone-500">{label}</div>
      <div
        className={`font-mono font-extrabold ${big ? "text-2xl" : "text-xl"} ${
          tone === "teal" ? "text-emerald-700" : "text-stone-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** 重要情報を抽出した日次売上レポート文を組み立てる */
function buildReportText(
  shop: string,
  dateStr: string,
  reports: ReportRow[],
  zan: number,
  tegankei: number,
): string {
  const [, m, d] = dateStr.split("-");
  const sales = reports.reduce((s, r) => s + (Number(r.sales_amount) || 0), 0);
  const expItems = reports
    .flatMap((r) => (Array.isArray(r.expenses) ? r.expenses : []))
    .filter((e) => (Number(e?.amount) || 0) !== 0);
  const expTotal = expItems.reduce((s, e) => s + (Number(e?.amount) || 0), 0);

  const uniq = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter((x): x is string => !!x && x.trim() !== "")));
  const locations = uniq(reports.map((r) => r.location));
  const staff = uniq(reports.map((r) => r.staff_name));
  const groups = reports.reduce((s, r) => s + (Number(r.customer_groups) || 0), 0);
  const alcohol = reports.reduce((s, r) => s + (Number(r.alcohol_count) || 0), 0);
  const regDiff = reports.reduce((s, r) => s + (Number(r.register_diff) || 0), 0);

  const lines: string[] = [
    `📊 ${shop} 売上報告（${parseInt(m, 10)}/${parseInt(d, 10)}）`,
    SEP,
    `売上合計：${yen(sales)}（日報${reports.length}件）`,
  ];
  if (locations.length) lines.push(`出店：${locations.join(" / ")}`);
  if (staff.length) lines.push(`担当：${staff.join(" / ")}`);

  // 商品内訳
  const naiyaku: string[] = [];
  if (shop === "もも屋") {
    const agg: Record<string, number> = {};
    for (const r of reports) {
      for (const [name, n] of Object.entries(r.product_counts || {})) {
        agg[name] = (agg[name] || 0) + (Number(n) || 0);
      }
    }
    for (const [name, n] of Object.entries(agg)) {
      if (n > 0) naiyaku.push(`・${name}：${n}`);
    }
  } else {
    const teba = reports.reduce(
      (s, r) => s + (Number(r.remaining_tebasaki) || 0),
      0,
    );
    const allstar = reports.reduce(
      (s, r) => s + (Number(r.allstar_count) || 0),
      0,
    );
    if (teba > 0) naiyaku.push(`・手羽先：${teba}本`);
    if (allstar > 0) naiyaku.push(`・オールスター：${allstar}個`);
  }
  if (groups > 0) naiyaku.push(`・組数：${groups}組`);
  if (alcohol > 0) naiyaku.push(`・お酒：${alcohol}本`);
  if (naiyaku.length) {
    lines.push("", "【内訳】", ...naiyaku);
  }

  // 経費
  lines.push("", "【経費】");
  if (expItems.length) {
    for (const e of expItems) {
      lines.push(`・${e.description?.trim() || "(内容未入力)"} ${yen(Number(e.amount) || 0)}`);
    }
  } else {
    lines.push("（なし）");
  }
  lines.push(`経費合計：${yen(expTotal)}`);

  if (regDiff !== 0) {
    lines.push("", `レジ差異：${yen(regDiff)}`);
  }

  lines.push(
    "",
    SEP,
    `残り：${yen(zan)}（売上−経費）`,
    `手元合計：${yen(tegankei)}`,
  );

  return lines.join("\n");
}
