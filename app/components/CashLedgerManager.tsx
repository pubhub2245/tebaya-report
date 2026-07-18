"use client";

import { useEffect, useMemo, useState } from "react";
import { yen, slashDate, todayStr } from "@/lib/format";
import {
  addCashEntry,
  deleteCashEntry,
  getCashSettings,
  getReportsSince,
  IN_CATEGORIES,
  listCashEntries,
  OUT_CATEGORIES,
  saveCashSettings,
  type CashDirection,
  type CashLedgerEntry,
  type CashLedgerSettings,
  type ReportCashRow,
} from "@/lib/cashLedger";

/** 現金の動き1件（履歴表示用） */
type Movement = {
  key: string;
  date: string;
  direction: CashDirection;
  amount: number;
  label: string;
  sub: string | null;
  entryId?: string; // 手入力エントリのみ（削除可能）
};

export default function CashLedgerManager() {
  const [settings, setSettings] = useState<CashLedgerSettings | null>(null);
  const [reports, setReports] = useState<ReportCashRow[]>([]);
  const [entries, setEntries] = useState<CashLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getCashSettings();
      const [reps, list] = await Promise.all([
        s ? getReportsSince(s.opening_date) : Promise.resolve([]),
        listCashEntries(),
      ]);
      setSettings(s);
      setReports(reps);
      setEntries(list);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  // スタート日以降の手入力のみ集計対象（それ以前は期首残高に含まれる）
  const countedEntries = useMemo(
    () =>
      settings
        ? entries.filter((e) => e.date >= settings.opening_date)
        : entries,
    [entries, settings],
  );
  const hiddenCount = entries.length - countedEntries.length;

  // 内訳
  const salesTotal = useMemo(
    () => reports.reduce((s, r) => s + r.sales_amount, 0),
    [reports],
  );
  const expenseTotal = useMemo(
    () => reports.reduce((s, r) => s + r.expenses_total, 0),
    [reports],
  );
  const manualInTotal = useMemo(
    () =>
      countedEntries
        .filter((e) => e.direction === "in")
        .reduce((s, e) => s + e.amount, 0),
    [countedEntries],
  );
  const manualOutTotal = useMemo(
    () =>
      countedEntries
        .filter((e) => e.direction === "out")
        .reduce((s, e) => s + e.amount, 0),
    [countedEntries],
  );
  const openingBalance = settings?.opening_balance ?? 0;
  const balance =
    openingBalance + salesTotal + manualInTotal - expenseTotal - manualOutTotal;

  // 履歴（売上・立替経費・手入力をまとめて時系列に）
  const movements = useMemo<Movement[]>(() => {
    const list: Movement[] = [];
    for (const r of reports) {
      const who = [r.location, r.staff_name].filter(Boolean).join(" / ");
      if (r.sales_amount > 0) {
        list.push({
          key: `sale-${r.id}`,
          date: r.date,
          direction: "in",
          amount: r.sales_amount,
          label: "売上",
          sub: who || null,
        });
      }
      if (r.expenses_total > 0) {
        list.push({
          key: `exp-${r.id}`,
          date: r.date,
          direction: "out",
          amount: r.expenses_total,
          label: "立替経費",
          sub: who || null,
        });
      }
    }
    for (const e of countedEntries) {
      list.push({
        key: `entry-${e.id}`,
        date: e.date,
        direction: e.direction,
        amount: e.amount,
        label: e.category,
        sub: e.memo,
        entryId: e.id,
      });
    }
    // 日付の新しい順
    return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [reports, countedEntries]);

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-xl font-bold text-brand-dark">💰 現金残高（手元のお金）</h2>
        <p className="text-xs text-stone-600 mt-1">
          入ってくるお金：売上（日報から自動）・緒方さん／川畑さんの手出し現金。
          出ていくお金：立替経費（日報から自動）・銀行入金などの臨時出金。
        </p>
      </div>

      {error && (
        <div className="text-sm font-semibold rounded-xl px-3 py-2 bg-red-50 text-red-700 border border-red-200">
          ❌ 読込エラー: {error}
        </div>
      )}
      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {!loading && !settings && <StartPointSetup onSaved={reload} />}

      {!loading && settings && (
        <>
          {/* 残高カード */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 p-5 text-center">
            <div className="text-sm text-emerald-800 font-semibold">
              いま手元にある現金（想定）
            </div>
            <div
              className={`text-4xl font-extrabold font-mono mt-1 ${
                balance >= 0 ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {yen(balance)}
            </div>
            <div className="text-xs text-emerald-700 mt-2">
              {slashDate(settings.opening_date)} スタート
            </div>
          </div>

          {/* 内訳 */}
          <div className="bg-stone-50 rounded-xl p-4 space-y-1 text-sm">
            <BreakdownRow label="期首残高（スタート地点の現金）" value={openingBalance} />
            <BreakdownRow label="＋ 売上（日報から自動）" value={salesTotal} />
            <BreakdownRow label="＋ 手出し現金・その他入金" value={manualInTotal} />
            <BreakdownRow label="− 立替経費（日報から自動）" value={expenseTotal} sign="-" />
            <BreakdownRow label="− その他の出金" value={manualOutTotal} sign="-" />
            <div className="flex justify-between border-t border-stone-300 pt-2 mt-1 font-bold">
              <span>= 現金残高</span>
              <span className="font-mono">{yen(balance)}</span>
            </div>
          </div>

          {/* 手出し・臨時出金の記録フォーム */}
          <EntryForm onAdded={reload} />

          {/* 履歴 */}
          <MovementList movements={movements} onDeleted={reload} />
          {hiddenCount > 0 && (
            <p className="text-xs text-stone-400">
              ※ スタート日より前の手入力 {hiddenCount} 件は集計に含めていません
            </p>
          )}

          {/* スタート地点の再設定 */}
          <StartPointSetup settings={settings} onSaved={reload} collapsible />
        </>
      )}
    </section>
  );
}

function BreakdownRow({
  label,
  value,
  sign,
}: {
  label: string;
  value: number;
  sign?: "-";
}) {
  return (
    <div className="flex justify-between text-stone-700">
      <span>{label}</span>
      <span className="font-mono">
        {sign === "-" && value !== 0 ? "−" : ""}
        {yen(value)}
      </span>
    </div>
  );
}

/* ---------- 手出し・臨時出金の記録フォーム ---------- */
function EntryForm({ onAdded }: { onAdded: () => void }) {
  const [date, setDate] = useState(todayStr());
  const [direction, setDirection] = useState<CashDirection>("in");
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState<string>(IN_CATEGORIES[0]);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const categories = direction === "out" ? OUT_CATEGORIES : IN_CATEGORIES;

  const switchDirection = (d: CashDirection) => {
    setDirection(d);
    setCategory((d === "out" ? OUT_CATEGORIES : IN_CATEGORIES)[0]);
  };

  const submit = async () => {
    if (!amount || amount <= 0) {
      setMsg({ kind: "err", text: "金額を入力してください" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await addCashEntry({ date, direction, amount, category, memo });
      setMsg({
        kind: "ok",
        text: `${direction === "out" ? "出金" : "入金"} ${yen(amount)} を記録しました`,
      });
      setAmount(0);
      setMemo("");
      onAdded();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  return (
    <div className="border border-stone-200 rounded-xl p-4 space-y-3">
      <h3 className="font-bold text-stone-700">手出し現金・臨時の出入りを記録</h3>
      <p className="text-xs text-stone-500">
        売上と立替経費は日報から自動で入るので、ここでは入れなくてOKです。
        緒方さん／川畑さんの手出し現金や、銀行入金などだけ記録してください。
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => switchDirection("in")}
          className={`rounded-xl py-3 font-bold border-2 transition-colors ${
            direction === "in"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-stone-700 border-stone-300"
          }`}
        >
          ＋ 入金（増える）
        </button>
        <button
          type="button"
          onClick={() => switchDirection("out")}
          className={`rounded-xl py-3 font-bold border-2 transition-colors ${
            direction === "out"
              ? "bg-red-600 text-white border-red-600"
              : "bg-white text-stone-700 border-stone-300"
          }`}
        >
          − 出金（減る）
        </button>
      </div>

      <div>
        <label className="label">日付</label>
        <input
          type="date"
          className="field"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div>
        <label className="label">金額</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
            ¥
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="field pl-8 text-right text-xl font-bold"
            value={amount || ""}
            onChange={(e) =>
              setAmount(Math.max(0, parseInt(e.target.value || "0", 10)))
            }
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <label className="label">種類</label>
        <select
          className="field"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">メモ（任意）</label>
        <input
          type="text"
          className="field"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="例：〇〇銀行に入金"
        />
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

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="btn-primary w-full"
      >
        {saving ? "記録中…" : "この内容で記録する"}
      </button>
    </div>
  );
}

/* ---------- 履歴 ---------- */
function MovementList({
  movements,
  onDeleted,
}: {
  movements: Movement[];
  onDeleted: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (m: Movement) => {
    if (!m.entryId) return;
    if (
      !confirm(
        `この記録を削除しますか？\n${slashDate(m.date)} / ${m.label} / ${yen(m.amount)}`,
      )
    )
      return;
    setDeletingId(m.entryId);
    try {
      await deleteCashEntry(m.entryId);
      onDeleted();
    } catch (err: any) {
      alert("削除に失敗しました: " + (err?.message || err));
    } finally {
      setDeletingId(null);
    }
  };

  if (movements.length === 0) {
    return (
      <div className="text-sm text-stone-500 text-center py-3">
        まだ現金の動きはありません
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="font-bold text-stone-700 text-sm">現金の動き（履歴）</h3>
      <div className="divide-y divide-stone-100">
        {movements.map((m) => {
          const isOut = m.direction === "out";
          return (
            <div key={m.key} className="flex items-center gap-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-stone-700">
                  {m.label}
                </div>
                <div className="text-xs text-stone-500 truncate">
                  {slashDate(m.date)}
                  {m.sub ? ` ・ ${m.sub}` : ""}
                </div>
              </div>
              <div
                className={`font-mono font-bold whitespace-nowrap ${
                  isOut ? "text-red-600" : "text-blue-600"
                }`}
              >
                {isOut ? "−" : "＋"}
                {yen(m.amount)}
              </div>
              {m.entryId ? (
                <button
                  onClick={() => handleDelete(m)}
                  disabled={deletingId === m.entryId}
                  className="text-xs text-red-600 border border-red-300 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-40"
                >
                  {deletingId === m.entryId ? "…" : "削除"}
                </button>
              ) : (
                <span className="text-[10px] text-stone-400 w-8 text-center">
                  日報
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- スタート地点（期首残高）設定 ---------- */
function StartPointSetup({
  settings,
  onSaved,
  collapsible = false,
}: {
  settings?: CashLedgerSettings | null;
  onSaved: () => void;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  const [date, setDate] = useState(settings?.opening_date ?? todayStr());
  const [balance, setBalance] = useState<number>(settings?.opening_balance ?? 0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const submit = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveCashSettings(date, balance);
      setMsg({ kind: "ok", text: "スタート地点を保存しました" });
      onSaved();
      if (collapsible) setOpen(false);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || String(e) });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-stone-500 underline"
      >
        ⚙️ スタート地点（期首残高）を再設定する
      </button>
    );
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
      <h3 className="font-bold text-amber-900">
        {settings ? "⚙️ スタート地点の再設定" : "🏁 まずスタート地点を設定してください"}
      </h3>
      <p className="text-xs text-amber-800 leading-relaxed">
        現金を実際に全部数えた日と、その日の朝の時点で持っていた現金の合計（レジの釣り銭も含む）を入れてください。
        この日以降の売上・経費が自動で反映されていきます。
      </p>
      <div>
        <label className="label">スタートの日付</label>
        <input
          type="date"
          className="field"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div>
        <label className="label">その日の朝の現金合計</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
            ¥
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
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
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="btn-secondary flex-1"
          >
            閉じる
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="btn-primary flex-[2]"
        >
          {saving ? "保存中…" : "保存する"}
        </button>
      </div>
    </div>
  );
}
