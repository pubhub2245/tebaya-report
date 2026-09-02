"use client";

/**
 * 経理（けいり）画面。管理者だけが見られます。
 *
 * ★設計は docs/keiri.md。計算は lib/keiri/ にまとめてあり、この画面は
 *   「読み込む → 呼び出す → 並べる」だけです（別の業態にも使い回せるように）。
 *
 * ★既存の日報・シフト・LINE通知の仕組みには一切さわっていません。
 *   読み取るだけです（keiri_reports ビュー＝日報からレシート写真を抜いた見え方）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { supabase } from "@/lib/supabase";
import { yen, slashDate, todayStr } from "@/lib/format";
import AdminGate from "@/app/components/AdminGate";
import {
  DEFAULT_SETTINGS,
  EXPENSE_ACCOUNTS,
  buildJournalRows,
  calcCashPosition,
  calcUnpaid,
  expenseSlices,
  monthKey,
  summarizeByLocation,
  summarizeMonth,
  templateFor,
  toCsv,
  PAYMENT_KIND_LABEL,
  type KeiriPayment,
  type KeiriReport,
  type KeiriSettings,
  type PaymentKind,
} from "@/lib/keiri";

/** この画面が扱う業態。別の業態を出したくなったらここを変える */
const BUSINESS_CODE = "tebaya";

/** ドーナツグラフの色（科目の並び順に対応） */
const SLICE_COLORS = [
  "#f97316", // 仕入（材料）
  "#0ea5e9", // 出店料
  "#14b8a6", // 人件費
  "#a855f7", // 外注費（Alpha）
  "#eab308", // 車両費
  "#ec4899", // 消耗品費
  "#64748b", // 通信費
  "#94a3b8", // 雑費
];

type Tab = "table" | "chart" | "location";

export default function KeiriPage() {
  return (
    <AdminGate>
      <KeiriInner />
    </AdminGate>
  );
}

function KeiriInner() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>("table");

  const [settings, setSettings] = useState<KeiriSettings | null>(null);
  const [reports, setReports] = useState<KeiriReport[]>([]);
  const [payments, setPayments] = useState<(KeiriPayment & { id: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ym = monthKey(year, month);
  const template = useMemo(() => templateFor(BUSINESS_CODE), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 設定（数え始めの日・期首残高・Alphaの率）
      const { data: s, error: sErr } = await supabase
        .from("keiri_settings")
        .select("opening_date, opening_balance, outsourcing_rate")
        .eq("business_type_code", BUSINESS_CODE)
        .maybeSingle();
      if (sErr) throw sErr;
      setSettings(
        s
          ? {
              opening_date: (s as any).opening_date,
              opening_balance: Number((s as any).opening_balance) || 0,
              outsourcing_rate: Number((s as any).outsourcing_rate) || 0,
            }
          : DEFAULT_SETTINGS,
      );

      // 日報。経費の種類を決めるのに「説明の文字」が要るので明細も取る。
      // ★ただし daily_reports から直接は取らない。keiri_reports というビュー
      //   （レシート写真の住所を抜いた軽い日報）から取る。
      //   写真ごと取ると1か月ぶんで数百KBになり画面が重くなるため（CLAUDE.md 4-2）。
      const from = (s as any)?.opening_date ?? DEFAULT_SETTINGS.opening_date;
      // 表示中の月が期首日より前でも見られるように、月初とどちらか早いほうから取る
      const gte = `${ym}-01` < from ? `${ym}-01` : from;
      const { data: reps, error: rErr } = await supabase
        .from("keiri_reports")
        .select("date, location, staff_name, sales_amount, labor, expenses")
        .gte("date", gte)
        .order("date");
      if (rErr) throw rErr;
      setReports((reps as KeiriReport[]) ?? []);

      // 支払い記録
      const { data: pays, error: pErr } = await supabase
        .from("keiri_payments")
        .select("id, paid_on, amount, kind, memo")
        .eq("business_type_code", BUSINESS_CODE)
        .order("paid_on", { ascending: false });
      if (pErr) throw pErr;
      setPayments((pays as (KeiriPayment & { id: number })[]) ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [ym]);

  useEffect(() => {
    load();
  }, [load]);

  const effective = settings ?? DEFAULT_SETTINGS;

  const summary = useMemo(
    () =>
      summarizeMonth({
        ym,
        reports,
        template,
        outsourcingRate: effective.outsourcing_rate,
      }),
    [ym, reports, template, effective.outsourcing_rate],
  );

  const cash = useMemo(
    () => calcCashPosition({ reports, payments, settings: effective }),
    [reports, payments, effective],
  );

  const unpaid = useMemo(
    () => calcUnpaid({ reports, payments, settings: effective }),
    [reports, payments, effective],
  );

  const byLocation = useMemo(
    () => summarizeByLocation({ ym, reports }),
    [ym, reports],
  );

  const slices = useMemo(() => expenseSlices(summary), [summary]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const downloadCsv = () => {
    const rows = buildJournalRows({
      ym,
      reports,
      payments,
      template,
      settings: effective,
    });
    const blob = new Blob([toCsv(rows)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keiri_${ym}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const ratePct = Math.round(effective.outsourcing_rate * 1000) / 10;

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">🧮 経理</h1>
        <div className="flex gap-2">
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
          <Link href="/admin" className="btn-secondary text-sm">
            管理者ページ
          </Link>
        </div>
      </header>

      {/* 月の切り替え */}
      <div className="card flex items-center justify-between">
        <button className="btn-secondary text-sm" onClick={() => shiftMonth(-1)}>
          ← 前の月
        </button>
        <div className="text-xl font-bold text-brand-dark">
          {year}年{month}月
        </div>
        <button className="btn-secondary text-sm" onClick={() => shiftMonth(1)}>
          次の月 →
        </button>
      </div>

      {error && (
        <p className="card bg-red-50 text-red-700 border border-red-200 text-sm">
          読み込みに失敗しました：{error}
        </p>
      )}
      {loading && <p className="text-stone-500 text-sm px-1">読み込み中…</p>}

      {/* 上段：大きな3つの数字 */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BigNumber
          title="今月の利益"
          value={summary.profit}
          signed
          color={summary.profit >= 0 ? "text-emerald-600" : "text-red-600"}
          note={`売上 ${yen(summary.sales)} − 経費 ${yen(summary.expenseTotal)}`}
        />
        <BigNumber
          title="今の現金"
          value={cash.balance}
          color="text-brand-dark"
          note={`${slashDate(cash.openingDate)} の ${yen(
            cash.openingBalance,
          )} から数えた今の手元`}
        />
        <BigNumber
          title="まだ払っていないお金"
          value={unpaid.total}
          color="text-amber-600"
          note={`給与 ${yen(unpaid.payroll)}・Alpha ${yen(unpaid.outsourcing)}`}
        />
      </section>

      {/* タブ */}
      <div className="flex gap-2">
        <TabButton active={tab === "table"} onClick={() => setTab("table")}>
          科目ごとの表
        </TabButton>
        <TabButton active={tab === "chart"} onClick={() => setTab("chart")}>
          グラフ
        </TabButton>
        <TabButton active={tab === "location"} onClick={() => setTab("location")}>
          場所別
        </TabButton>
      </div>

      {tab === "table" && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold text-brand-dark">
            {year}年{month}月の科目ごとの金額
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-stone-200">
                  <td className="py-2 font-bold">売上高</td>
                  <td className="py-2 text-right font-bold tabular-nums">
                    {yen(summary.sales)}
                  </td>
                </tr>
                {EXPENSE_ACCOUNTS.map((a) => (
                  <tr key={a.key} className="border-b border-stone-100">
                    <td className="py-2 pl-3 text-stone-700">
                      {a.label}
                      {a.key === "outsourcing" && (
                        <span className="text-xs text-stone-400">
                          （売上高の{ratePct}%・自動計算）
                        </span>
                      )}
                      {a.key === "payroll" && (
                        <span className="text-xs text-stone-400">
                          （日報の日当の合計）
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {yen(summary.expenseByAccount[a.key])}
                    </td>
                  </tr>
                ))}
                <tr className="border-b-2 border-stone-300">
                  <td className="py-2 font-bold">経費合計</td>
                  <td className="py-2 text-right font-bold tabular-nums">
                    {yen(summary.expenseTotal)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-bold text-base">利益</td>
                  <td
                    className={`py-3 text-right font-bold text-base tabular-nums ${
                      summary.profit >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {yen(summary.profit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-400">
            集計は日報の「営業日」で数えています（入力した日時ではありません）。
            対象の日報：{summary.reportCount}件
          </p>

          <UnmatchedNote unmatched={summary.unmatched} />
        </section>
      )}

      {tab === "chart" && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold text-brand-dark">
            {year}年{month}月の経費の内訳
          </h2>
          {slices.length === 0 ? (
            <p className="text-sm text-stone-500">この月の経費はまだありません。</p>
          ) : (
            <div className="h-80">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="45%"
                    outerRadius="75%"
                    paddingAngle={2}
                  >
                    {slices.map((s, i) => (
                      <Cell
                        key={s.key}
                        fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => yen(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-xs text-stone-400">
            経費合計 {yen(summary.expenseTotal)}（人件費・外注費を含む）
          </p>
        </section>
      )}

      {tab === "location" && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold text-brand-dark">
            {year}年{month}月の出店場所ごとの成績
          </h2>
          {byLocation.length === 0 ? (
            <p className="text-sm text-stone-500">この月の日報はまだありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-stone-500 border-b border-stone-200">
                    <th className="text-left py-2">出店場所</th>
                    <th className="text-right py-2">日数</th>
                    <th className="text-right py-2">売上</th>
                    <th className="text-right py-2">経費</th>
                    <th className="text-right py-2">利益</th>
                  </tr>
                </thead>
                <tbody>
                  {byLocation.map((row) => (
                    <tr key={row.location} className="border-b border-stone-100">
                      <td className="py-2">{row.location}</td>
                      <td className="py-2 text-right tabular-nums">
                        {row.reportCount}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {yen(row.sales)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {yen(row.costTotal)}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums font-semibold ${
                          row.profit >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {yen(row.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-stone-400">
            「経費」は日報の経費と人件費（日当）の合計です。
            外注費（Alpha）は月ごとに決まるお金なので、場所別には入れていません
            （どの場所のぶんか決められないため）。
            出店場所が空の日報は「未設定」にまとめています。
          </p>
        </section>
      )}

      {/* CSV書き出し */}
      <section className="card space-y-2">
        <h2 className="text-lg font-bold text-brand-dark">📤 CSV書き出し</h2>
        <p className="text-sm text-stone-600 leading-relaxed">
          {year}年{month}月のぜんぶの売上と経費を、会計ソフトが読める形で書き出します。
          Excelで開いても文字化けしません。
        </p>
        <button className="btn-primary w-full" onClick={downloadCsv}>
          この月のCSVをダウンロード
        </button>
      </section>

      {/* 支払いの記録 */}
      <PaymentSection
        payments={payments}
        onSaved={load}
        unpaidPayroll={unpaid.payroll}
        unpaidOutsourcing={unpaid.outsourcing}
      />

      {/* 設定 */}
      <SettingsSection settings={effective} onSaved={load} />
    </main>
  );
}

// ------------------------------------------------------------------
// 部品
// ------------------------------------------------------------------

function BigNumber({
  title,
  value,
  note,
  color,
  signed,
}: {
  title: string;
  value: number;
  note?: string;
  color: string;
  signed?: boolean;
}) {
  const text = signed && value > 0 ? `+${yen(value)}` : yen(value);
  return (
    <div className="card">
      <p className="text-sm font-semibold text-stone-500">{title}</p>
      <p className={`text-3xl font-bold tabular-nums mt-1 ${color}`}>{text}</p>
      {note && <p className="text-xs text-stone-400 mt-1 leading-relaxed">{note}</p>}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
        active
          ? "bg-brand text-white shadow"
          : "bg-stone-200 text-stone-700 hover:bg-stone-300"
      }`}
    >
      {children}
    </button>
  );
}

/** 対応表に当たらず雑費に入れた明細のお知らせ（あとから直せるように） */
function UnmatchedNote({
  unmatched,
}: {
  unmatched: { date: string; description: string; amount: number }[];
}) {
  const [open, setOpen] = useState(false);
  if (unmatched.length === 0) {
    return (
      <p className="text-xs text-stone-400">
        ※ この月は、種類が分からずに「雑費」へ入れた経費はありません。
      </p>
    );
  }
  const total = unmatched.reduce((s, u) => s + u.amount, 0);
  return (
    <div className="text-xs text-stone-500 space-y-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="underline hover:text-stone-700"
      >
        ※ 種類が分からず「雑費」に入れた経費：{unmatched.length}件・{yen(total)}
        （{open ? "閉じる" : "中身を見る"}）
      </button>
      {open && (
        <ul className="pl-4 space-y-0.5">
          {unmatched.map((u, i) => (
            <li key={`${u.date}-${i}`}>
              {slashDate(u.date)} {u.description} … {yen(u.amount)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 給与・Alphaに実際に払った記録 */
function PaymentSection({
  payments,
  onSaved,
  unpaidPayroll,
  unpaidOutsourcing,
}: {
  payments: (KeiriPayment & { id: number })[];
  onSaved: () => void;
  unpaidPayroll: number;
  unpaidOutsourcing: number;
}) {
  const [paidOn, setPaidOn] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<PaymentKind>("payroll");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(amount || "0", 10);
    if (!paidOn) return setMsg("❌ 支払日を入れてください");
    if (!n || n <= 0) return setMsg("❌ 金額を入れてください");
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.from("keiri_payments").insert({
      business_type_code: BUSINESS_CODE,
      paid_on: paidOn,
      amount: n,
      kind,
      memo: memo.trim() || null,
    });
    setSaving(false);
    if (error) {
      setMsg(`❌ 保存できませんでした：${error.message}`);
      return;
    }
    setAmount("");
    setMemo("");
    setMsg("✅ 記録しました");
    onSaved();
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold text-brand-dark">
        💴 給与・Alphaに払ったお金の記録
      </h2>
      <p className="text-sm text-stone-600 leading-relaxed">
        月に1回、実際に払ったときにここへ入れてください。
        入れると「今の現金」からその分が引かれ、「まだ払っていないお金」が減ります。
        <br />
        いま残っている未払い：給与 {yen(unpaidPayroll)}・Alpha{" "}
        {yen(unpaidOutsourcing)}
      </p>

      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">支払日</label>
          <input
            type="date"
            className="field"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </div>
        <div>
          <label className="label">種別</label>
          <select
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value as PaymentKind)}
          >
            <option value="payroll">{PAYMENT_KIND_LABEL.payroll}</option>
            <option value="outsourcing">{PAYMENT_KIND_LABEL.outsourcing}</option>
          </select>
        </div>
        <div>
          <label className="label">金額（円）</label>
          <input
            type="number"
            inputMode="numeric"
            className="field"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例：294200"
          />
        </div>
        <div>
          <label className="label">メモ（任意）</label>
          <input
            type="text"
            className="field"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例：8月分"
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? "保存中…" : "記録する"}
          </button>
        </div>
      </form>
      {msg && <p className="text-sm font-semibold">{msg}</p>}

      {payments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-stone-500 border-b border-stone-200">
                <th className="text-left py-2">支払日</th>
                <th className="text-left py-2">種別</th>
                <th className="text-right py-2">金額</th>
                <th className="text-left py-2">メモ</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-stone-100">
                  <td className="py-2">{slashDate(p.paid_on)}</td>
                  <td className="py-2">{PAYMENT_KIND_LABEL[p.kind]}</td>
                  <td className="py-2 text-right tabular-nums">{yen(p.amount)}</td>
                  <td className="py-2 text-stone-500">{p.memo ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** 数え始めの日・期首残高・Alphaの率の設定 */
function SettingsSection({
  settings,
  onSaved,
}: {
  settings: KeiriSettings;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openingDate, setOpeningDate] = useState(settings.opening_date);
  const [openingBalance, setOpeningBalance] = useState(
    String(settings.opening_balance),
  );
  const [ratePct, setRatePct] = useState(
    String(Math.round(settings.outsourcing_rate * 1000) / 10),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setOpeningDate(settings.opening_date);
    setOpeningBalance(String(settings.opening_balance));
    setRatePct(String(Math.round(settings.outsourcing_rate * 1000) / 10));
  }, [settings]);

  const save = async () => {
    const bal = parseInt(openingBalance || "0", 10);
    const pct = Number(ratePct);
    if (!openingDate) return setMsg("❌ 数え始めの日を入れてください");
    if (Number.isNaN(bal)) return setMsg("❌ 金額を入れてください");
    if (Number.isNaN(pct) || pct < 0 || pct > 100)
      return setMsg("❌ 率は0〜100の数字で入れてください");
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from("keiri_settings")
      .update({
        opening_date: openingDate,
        opening_balance: bal,
        outsourcing_rate: pct / 100,
        updated_at: new Date().toISOString(),
      })
      .eq("business_type_code", BUSINESS_CODE);
    setSaving(false);
    if (error) {
      setMsg(`❌ 保存できませんでした：${error.message}`);
      return;
    }
    setMsg("✅ 保存しました");
    onSaved();
  };

  return (
    <section className="card space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-lg font-bold text-brand-dark"
      >
        ⚙️ 経理の設定 {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-stone-600 leading-relaxed">
            「数え始めの日」は、手元の現金をここから数え直す日です。
            いまは {slashDate(settings.opening_date)} に {yen(settings.opening_balance)}{" "}
            から数えています（7月分の給与を払い終えて残高がちょうど0円になった日）。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">数え始めの日</label>
              <input
                type="date"
                className="field"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">その日の現金（円）</label>
              <input
                type="number"
                inputMode="numeric"
                className="field"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Alphaの率（％）</label>
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                className="field"
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value)}
              />
            </div>
          </div>
          <button className="btn-primary w-full" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "設定を保存する"}
          </button>
          {msg && <p className="text-sm font-semibold">{msg}</p>}
        </div>
      )}
    </section>
  );
}
