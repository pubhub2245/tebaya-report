"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PRE_CHECK_FIELDS,
  POST_CHECK_FIELDS,
  initialPreCheck,
  initialPostCheck,
  normalizeCheckState,
  isFieldVisible,
  type PrepCheckField,
  type PrepCheckState,
} from "@/lib/prepChecklist";
import {
  getActiveProducts,
  getCarryoverFromYesterday,
  calculateTheoreticalPrepQuantity,
  calculatePrepMinutes,
  getStaffPrepReport,
  calculateAutoCarryover,
  calculateMonthlyCostBreakdown,
  getDirectCostStatus,
  getPrepSettings,
  type PrepProduct,
  type TheoreticalPrepResult,
  type AutoCarryoverEntry,
  type MonthlyCostBreakdown,
  type PrepSettings,
} from "@/lib/prepHelpers";

const STAFF_OPTIONS = ["なぎさ"];

type SessionItemForm = {
  product_id: string;
  quantity: number;
};

type SessionForm = {
  session_label: string;
  items: SessionItemForm[];
};

type CarryoverForm = {
  product_id: string;
  quantity: number;
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function newSession(): SessionForm {
  return {
    session_label: "",
    items: [{ product_id: "", quantity: 0 }],
  };
}

export default function PrepReportPage() {
  const [date, setDate] = useState<string>(todayIso());
  const [staffName, setStaffName] = useState<string>(STAFF_OPTIONS[0]);
  const [products, setProducts] = useState<PrepProduct[]>([]);
  const [carryoverYesterday, setCarryoverYesterday] = useState<
    Array<{ product_id: string; product_name: string; quantity: number; unit_label: string }>
  >([]);
  /** 翌日繰越の自動計算結果（前々日繰越 + 前日仕込み - 前日使用） */
  const [autoCarryovers, setAutoCarryovers] = useState<AutoCarryoverEntry[]>([]);
  /** 当月の直接費比率（参考表示用） */
  const [monthlyCost, setMonthlyCost] = useState<MonthlyCostBreakdown | null>(null);
  const [monthlySettings, setMonthlySettings] = useState<PrepSettings | null>(null);
  const [theoretical, setTheoretical] = useState<TheoreticalPrepResult | null>(null);
  const [showTheoretical, setShowTheoretical] = useState(true);
  const [sessions, setSessions] = useState<SessionForm[]>([newSession()]);
  const [fieldWork, setFieldWork] = useState(0);
  const [procurement, setProcurement] = useState(0);
  const [ordering, setOrdering] = useState(0);
  const [setup, setSetup] = useState(0);
  const [other, setOther] = useState(0);
  const [otherDesc, setOtherDesc] = useState("");
  const [memo, setMemo] = useState("");
  const [carryovers, setCarryovers] = useState<CarryoverForm[]>([]);
  const [preCheck, setPreCheck] = useState<PrepCheckState>(initialPreCheck());
  const [postCheck, setPostCheck] = useState<PrepCheckState>(initialPostCheck());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  // 当月の直接費比率（参考表示用）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [y, m] = date.split("-").map((s) => parseInt(s, 10));
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const [breakdown, settings] = await Promise.all([
        calculateMonthlyCostBreakdown(y, m, staffName),
        getPrepSettings(endDate),
      ]);
      if (cancelled) return;
      setMonthlyCost(breakdown);
      setMonthlySettings(settings);
    })();
    return () => {
      cancelled = true;
    };
  }, [date, staffName]);

  // 商品マスター・前日繰越・理論量を取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [prods, co, th, autoCO] = await Promise.all([
          getActiveProducts(date),
          getCarryoverFromYesterday(date),
          calculateTheoreticalPrepQuantity(date),
          calculateAutoCarryover(date),
        ]);
        if (cancelled) return;
        setProducts(prods);
        setCarryoverYesterday(co);
        setTheoretical(th);
        setAutoCarryovers(autoCO);
        // 繰越トラック対象商品の入力欄を初期化（自動計算値をプリセット）
        const tracked = prods.filter((p) => p.is_carryover_tracked);
        const autoMap = new Map<string, number>();
        for (const a of autoCO) autoMap.set(a.product_id, a.calculated_quantity);
        setCarryovers((prev) => {
          if (prev.length > 0) return prev;
          return tracked.map((p) => ({
            product_id: p.id,
            quantity: autoMap.get(p.id) ?? 0,
          }));
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // 既存レポートの読み込み
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bundle = await getStaffPrepReport(date, staffName);
      if (cancelled) return;
      if (bundle.report) {
        setFieldWork(bundle.report.field_work_minutes);
        setProcurement(bundle.report.procurement_minutes);
        setOrdering(bundle.report.ordering_minutes);
        setSetup(bundle.report.setup_minutes);
        setOther(bundle.report.other_minutes);
        setOtherDesc(bundle.report.other_description ?? "");
        setMemo(bundle.report.memo ?? "");
        // チェックリスト復元（未保存なら初期値）
        setPreCheck(normalizeCheckState(bundle.report.pre_check, PRE_CHECK_FIELDS));
        setPostCheck(
          normalizeCheckState(bundle.report.post_check, POST_CHECK_FIELDS),
        );
        // sessions + items 復元
        if (bundle.sessions.length > 0) {
          const sessForms: SessionForm[] = bundle.sessions
            .sort((a, b) => a.display_order - b.display_order)
            .map((s) => ({
              session_label: s.session_label ?? "",
              items: bundle.items
                .filter((i) => i.prep_session_id === s.id)
                .map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
            }));
          setSessions(sessForms.length > 0 ? sessForms : [newSession()]);
        }
        // 当日繰越の復元
        const todayCo = bundle.carryovers.filter((c) => c.date === date);
        if (todayCo.length > 0) {
          setCarryovers(
            todayCo.map((c) => ({ product_id: c.product_id, quantity: c.quantity })),
          );
        }
      } else {
        // 既存レポートが無い場合は初期化
        setFieldWork(0);
        setProcurement(0);
        setOrdering(0);
        setSetup(0);
        setOther(0);
        setOtherDesc("");
        setMemo("");
        setSessions([newSession()]);
        setPreCheck(initialPreCheck());
        setPostCheck(initialPostCheck());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, staffName]);

  // 商品マップ（速度計算用）
  const productMap = useMemo(() => {
    const m = new Map<string, PrepProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  // 各セッションの所要分数
  const sessionMinutes = useMemo(
    () =>
      sessions.map((s) =>
        calculatePrepMinutes(
          s.items,
          productMap as unknown as Map<string, { speed_basis: PrepProduct["speed_basis"]; speed_minutes: number }>,
        ),
      ),
    [sessions, productMap],
  );
  const totalPrepMinutes = sessionMinutes.reduce((a, b) => a + b, 0);
  const totalNonPrepMinutes = fieldWork + procurement + ordering + setup + other;
  const grandTotal = totalPrepMinutes + totalNonPrepMinutes;

  // ----- セッション操作 -----
  const addSession = () => setSessions([...sessions, newSession()]);
  const removeSession = (idx: number) => {
    if (sessions.length <= 1) return;
    setSessions(sessions.filter((_, i) => i !== idx));
  };
  const updateSession = (idx: number, patch: Partial<SessionForm>) => {
    setSessions(sessions.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const addItem = (sIdx: number) => {
    updateSession(sIdx, {
      items: [...sessions[sIdx].items, { product_id: "", quantity: 0 }],
    });
  };
  const removeItem = (sIdx: number, iIdx: number) => {
    const next = sessions[sIdx].items.filter((_, i) => i !== iIdx);
    updateSession(sIdx, { items: next.length > 0 ? next : [{ product_id: "", quantity: 0 }] });
  };
  const updateItem = (sIdx: number, iIdx: number, patch: Partial<SessionItemForm>) => {
    const next = sessions[sIdx].items.map((it, i) => (i === iIdx ? { ...it, ...patch } : it));
    updateSession(sIdx, { items: next });
  };

  // ----- 保存 -----
  const handleSave = async () => {
    setFeedback(null);
    // 簡易バリデーション
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const filledItems = s.items.filter((it) => it.product_id);
      if (filledItems.length === 0) {
        setFeedback({ kind: "err", text: `セッション #${i + 1}: 商品を1件以上選択してください` });
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        date,
        staff_name: staffName,
        sessions: sessions.map((s) => ({
          session_label: s.session_label || null,
          items: s.items
            .filter((it) => it.product_id)
            .map((it) => ({
              product_id: it.product_id,
              quantity: Math.max(0, it.quantity || 0),
            })),
        })),
        field_work_minutes: fieldWork,
        procurement_minutes: procurement,
        ordering_minutes: ordering,
        setup_minutes: setup,
        other_minutes: other,
        other_description: otherDesc,
        memo,
        carryovers: carryovers
          .filter((c) => c.product_id)
          .map((c) => ({ product_id: c.product_id, quantity: Math.max(0, c.quantity || 0) })),
        pre_check: preCheck,
        post_check: postCheck,
      };
      const res = await fetch("/api/prep/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "保存に失敗しました");
      }
      setFeedback({
        kind: "ok",
        text: `保存しました（セッション ${json.sessions_count} 件、品目 ${json.items_count} 件）`,
      });
    } catch (e: any) {
      setFeedback({ kind: "err", text: e?.message || "保存失敗" });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-32 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
        >
          🏠 トップ
        </Link>
        <h1 className="text-xl font-bold text-brand-dark">🍳 仕込み日報</h1>
        <div className="w-16" />
      </header>

      {/* 当月の直接費比率（参考表示） */}
      {monthlyCost && monthlySettings && monthlyCost.total_minutes > 0 && (
        <DirectCostBadge breakdown={monthlyCost} settings={monthlySettings} />
      )}

      {/* セクション1: 基本情報 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold">基本情報</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field text-sm"
            />
          </div>
          <div>
            <label className="label">担当者</label>
            <select
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              className="field text-sm"
            >
              {STAFF_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* セクション2: 前日の繰越 */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold">前日の繰越（参考）</h2>
        {loading ? (
          <p className="text-sm text-stone-500">読み込み中…</p>
        ) : carryoverYesterday.length === 0 ? (
          <p className="text-sm text-stone-400">前日の繰越データはありません</p>
        ) : (
          <ul className="text-sm space-y-1">
            {carryoverYesterday.map((c) => (
              <li key={c.product_id}>
                ・{c.product_name}：<strong>{c.quantity}</strong>{c.unit_label}（前日繰越）
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* セクション3: 明日の必要仕込み量 */}
      <section className="card space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">📋 明日の必要仕込み量</h2>
          <button
            type="button"
            onClick={() => setShowTheoretical(!showTheoretical)}
            className="text-xs text-stone-600 underline"
          >
            {showTheoretical ? "折りたたむ" : "展開"}
          </button>
        </div>
        {showTheoretical && <TheoreticalPanel result={theoretical} />}
      </section>

      {/* セクション3.5: 仕込み前チェック */}
      <ChecklistSection
        title="✅ 仕込み前チェック"
        emoji="📝"
        description="仕込み作業を始める前にひとつずつ確認してください"
        fields={PRE_CHECK_FIELDS}
        state={preCheck}
        onChange={setPreCheck}
      />

      {/* セクション4: 仕込みセッション */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold">仕込みセッション</h2>
        {sessions.map((s, sIdx) => (
          <div
            key={sIdx}
            className="border border-stone-200 rounded-xl p-3 space-y-2 bg-stone-50/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">セッション #{sIdx + 1}</span>
              {sessions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSession(sIdx)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  ＋ セッション削除
                </button>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-stone-600 block mb-0.5">
                ラベル（任意）
              </label>
              <input
                type="text"
                value={s.session_label}
                onChange={(e) =>
                  updateSession(sIdx, { session_label: e.target.value })
                }
                placeholder="朝/昼/夜"
                className="field text-sm py-1.5"
              />
            </div>

            <div className="space-y-1">
              {s.items.map((it, iIdx) => (
                <div key={iIdx} className="flex items-center gap-2">
                  <select
                    value={it.product_id}
                    onChange={(e) =>
                      updateItem(sIdx, iIdx, { product_id: e.target.value })
                    }
                    className="field text-sm py-1.5 flex-1"
                  >
                    <option value="">— 商品 —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={it.quantity || ""}
                    onChange={(e) =>
                      updateItem(sIdx, iIdx, {
                        quantity: parseInt(e.target.value || "0", 10),
                      })
                    }
                    placeholder="0"
                    className="field text-sm py-1.5 w-24 text-right"
                  />
                  <span className="text-xs text-stone-500 w-10">
                    {productMap.get(it.product_id)?.unit_label ?? ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(sIdx, iIdx)}
                    className="text-stone-400 hover:text-red-600 text-lg leading-none px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addItem(sIdx)}
                className="text-xs text-brand hover:text-brand-dark underline"
              >
                ＋ 商品を追加
              </button>
            </div>

            {/* このセッションの作業時間の目安（本数換算） */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-900">
              <div className="text-xs font-semibold">⏱ 作業時間の目安</div>
              <div className="text-xl font-bold leading-tight">
                約 {(sessionMinutes[sIdx] / 60).toFixed(1)} 時間
                <span className="text-sm font-normal text-amber-800 ml-1">
                  （{sessionMinutes[sIdx]}分）
                </span>
              </div>
              <div className="text-[11px] text-amber-700 mt-0.5">
                ※ 換算ルール：手羽先 100本 ＝ 1時間、餃子 100本 ＝ 1.5時間、ポテト 1セッション ＝ 1時間
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addSession}
          className="btn-secondary w-full text-sm"
        >
          ＋ セッションを追加
        </button>
      </section>

      {/* セクション5: 業務時間カテゴリ */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold">業務時間（仕込み以外）</h2>
        <div className="space-y-2">
          {[
            { label: "現場勤務", value: fieldWork, set: setFieldWork },
            { label: "仕入れ・買い出し", value: procurement, set: setProcurement },
            { label: "発注・業者連絡", value: ordering, set: setOrdering },
            { label: "翌日準備・セッティング", value: setup, set: setSetup },
            { label: "その他", value: other, set: setOther },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center gap-2 bg-stone-50 rounded-lg px-2 py-1.5"
            >
              <div className="flex-1 text-sm">{row.label}</div>
              <input
                type="number"
                min={0}
                value={row.value || ""}
                onChange={(e) => row.set(parseInt(e.target.value || "0", 10))}
                className="field text-sm py-1 w-20 text-right"
                placeholder="0"
              />
              <span className="text-xs text-stone-500 w-6">分</span>
            </div>
          ))}
          {other > 0 && (
            <div>
              <label className="text-xs font-bold text-stone-700 block mb-0.5">
                その他の内容
              </label>
              <input
                type="text"
                value={otherDesc}
                onChange={(e) => setOtherDesc(e.target.value)}
                className="field text-sm"
                placeholder="例：清掃、研修、SNS投稿など"
              />
            </div>
          )}
        </div>
        <div className="bg-stone-100 rounded-lg p-2 text-sm space-y-0.5">
          <div className="flex justify-between">
            <span>仕込み時間（セッション合計）</span>
            <span className="font-mono font-bold">{totalPrepMinutes}分</span>
          </div>
          <div className="flex justify-between">
            <span>仕込み以外</span>
            <span className="font-mono">{totalNonPrepMinutes}分</span>
          </div>
          <div className="flex justify-between border-t border-stone-300 pt-1">
            <span className="font-bold">合計</span>
            <span className="font-mono font-bold text-brand-dark">
              {grandTotal}分（{(grandTotal / 60).toFixed(1)}h）
            </span>
          </div>
        </div>
      </section>

      {/* セクション6: 翌日への繰越 */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold">翌日への繰越</h2>
        {/* データ揃わない場合の警告 */}
        {autoCarryovers.length > 0 &&
          autoCarryovers.some(
            (a) => !a.has_yesterday_sales || !a.has_yesterday_prep,
          ) && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg px-2 py-1.5">
              ⚠️ 前日の{" "}
              {autoCarryovers[0]?.has_yesterday_sales ? "" : "営業後日報"}
              {!autoCarryovers[0]?.has_yesterday_sales &&
              !autoCarryovers[0]?.has_yesterday_prep
                ? "・"
                : ""}
              {autoCarryovers[0]?.has_yesterday_prep ? "" : "仕込み日報"}
              がまだ提出されていません。自動計算は不完全な可能性があるので、必要なら手入力してください。
            </div>
          )}
        {products
          .filter((p) => p.is_carryover_tracked)
          .map((p) => {
            const co = carryovers.find((c) => c.product_id === p.id);
            const auto = autoCarryovers.find((a) => a.product_id === p.id);
            const autoQty = auto?.calculated_quantity ?? null;
            const currentQty = co?.quantity ?? 0;
            const isOverridden =
              autoQty !== null && currentQty !== autoQty;
            return (
              <div
                key={p.id}
                className="bg-stone-50 rounded-lg px-2 py-1.5 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-sm">{p.name}</div>
                  <input
                    type="number"
                    min={0}
                    value={co?.quantity || ""}
                    onChange={(e) => {
                      const next = parseInt(e.target.value || "0", 10);
                      setCarryovers((prev) => {
                        const exists = prev.find((c) => c.product_id === p.id);
                        if (exists) {
                          return prev.map((c) =>
                            c.product_id === p.id ? { ...c, quantity: next } : c,
                          );
                        }
                        return [...prev, { product_id: p.id, quantity: next }];
                      });
                    }}
                    className="field text-sm py-1 w-24 text-right"
                    placeholder="0"
                  />
                  <span className="text-xs text-stone-500 w-6">{p.unit_label}</span>
                </div>
                {auto && (
                  <div className="text-[11px] leading-tight pl-1">
                    {isOverridden ? (
                      <div className="text-amber-700 font-bold">
                        ⚠️ 自動計算値から変更されています（自動: {autoQty}{p.unit_label} → 手入力: {currentQty}{p.unit_label}）
                      </div>
                    ) : (
                      <div className="text-stone-500">
                        自動計算: {autoQty}{p.unit_label}
                      </div>
                    )}
                    <details className="text-stone-500 mt-0.5">
                      <summary className="cursor-pointer">詳細</summary>
                      <div className="bg-white rounded px-2 py-1 mt-1 font-mono text-[10px]">
                        {auto.source_summary}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
      </section>

      {/* セクション6.5: 仕込み後チェック */}
      <ChecklistSection
        title="✅ 仕込み後チェック"
        emoji="🧹"
        description="仕込み作業を終えたあとの確認項目"
        fields={POST_CHECK_FIELDS}
        state={postCheck}
        onChange={setPostCheck}
      />

      {/* セクション7: メモ */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold">メモ・引き継ぎ（任意）</h2>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={4}
          className="field text-sm"
          placeholder="次回への引き継ぎ事項など"
        />
      </section>

      {feedback && (
        <div
          className={`text-sm font-semibold rounded-xl px-3 py-2 ${
            feedback.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.kind === "ok" ? "✅" : "❌"} {feedback.text}
        </div>
      )}

      {/* セクション8: 保存 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full"
          >
            {saving ? "保存中…" : "保存して送信"}
          </button>
        </div>
      </div>
    </main>
  );
}

function TheoreticalPanel({ result }: { result: TheoreticalPrepResult | null }) {
  if (!result) {
    return <p className="text-sm text-stone-400">読み込み中…</p>;
  }
  if (result.shifts.length === 0 || result.total_target === 0) {
    return (
      <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-900">
        明日のシフトがまだ確定していません。仕込み量はじゅんさんに確認してください。
      </div>
    );
  }
  const [, m, d] = result.tomorrow.split("-");
  const dateLabel = `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  const yen = (n: number) => `¥${n.toLocaleString()}`;
  const productEmoji = (name: string) =>
    name === "手羽先" ? "🍗" : name === "餃子" ? "🥟" : "🍳";
  return (
    <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
      <div className="font-bold text-amber-900">
        明日（{dateLabel}）の必要仕込み量
      </div>
      <div className="text-xs text-stone-700 space-y-0.5">
        <div className="font-semibold">店舗予定：</div>
        <ul className="pl-3 space-y-0.5">
          {result.shifts.map((s, i) => (
            <li key={i}>
              ・{s.location_name}
              {s.rank ? s.rank : ""}　{yen(s.target)}
            </li>
          ))}
        </ul>
        <div className="pt-1 font-semibold">
          売上目標合計：{yen(result.total_target)}
        </div>
      </div>
      {result.items.length === 0 ? (
        <p className="text-xs text-stone-500">設定が未登録のため本数を計算できません</p>
      ) : (
        <div className="space-y-1.5 pt-1 border-t border-amber-200">
          {result.items.map((it) => (
            <div key={it.product_id}>
              <div className="font-bold text-amber-900">
                {productEmoji(it.product_name)} {it.product_name}：
                <span className="text-lg">{it.theoretical_quantity}</span>本
              </div>
              <div className="text-xs text-stone-600 pl-5">
                目標 {it.target}本 − 余り {it.carryover}本
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DirectCostBadge({
  breakdown,
  settings,
}: {
  breakdown: MonthlyCostBreakdown;
  settings: PrepSettings;
}) {
  const ratio = breakdown.direct_cost_ratio;
  const status = getDirectCostStatus(ratio, settings);
  const colorMap: Record<typeof status.color, string> = {
    red: "bg-red-100 text-red-800 border-red-300",
    amber: "bg-amber-100 text-amber-800 border-amber-300",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-300",
  };
  return (
    <div
      className={`flex items-center justify-between text-xs rounded-lg border px-2 py-1.5 ${colorMap[status.color]}`}
    >
      <span className="font-semibold">📊 今月の直接費比率</span>
      <span className="font-bold">
        {(ratio * 100).toFixed(1)}%（{status.label}）
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ✅ ChecklistSection（仕込み前 / 仕込み後 共通）
// ---------------------------------------------------------------------------

function ChecklistSection({
  title,
  emoji,
  description,
  fields,
  state,
  onChange,
}: {
  title: string;
  emoji: string;
  description: string;
  fields: PrepCheckField[];
  state: PrepCheckState;
  onChange: (next: PrepCheckState) => void;
}) {
  const updateField = (key: string, value: boolean | string | number) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <section className="card space-y-2">
      <h2 className="text-base font-bold">{title}</h2>
      <p className="text-xs text-stone-500">
        {emoji} {description}
      </p>
      <div className="space-y-2">
        {fields.map((f) => {
          if (!isFieldVisible(f, state)) return null;

          if (f.type === "check") {
            const checked = state[f.key] === true;
            return (
              <label
                key={f.key}
                className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => updateField(f.key, e.target.checked)}
                  className="w-5 h-5 accent-brand"
                />
                <span className="text-sm flex-1">{f.label}</span>
                {f.hint && (
                  <span className="text-[10px] text-stone-400 hidden sm:inline">
                    {f.hint}
                  </span>
                )}
              </label>
            );
          }

          if (f.type === "number") {
            const v = state[f.key];
            const num = typeof v === "number" ? v : 0;
            return (
              <div
                key={f.key}
                className="flex items-center gap-2 bg-stone-50 rounded-xl px-3 py-2"
              >
                <span className="text-sm flex-1">{f.label}</span>
                <input
                  type="number"
                  min={0}
                  value={num || ""}
                  onChange={(e) =>
                    updateField(f.key, parseInt(e.target.value || "0", 10))
                  }
                  className="field text-sm py-1 w-24 text-right"
                  placeholder="0"
                />
              </div>
            );
          }

          // text or date
          const v = state[f.key];
          const str = typeof v === "string" ? v : "";
          return (
            <div
              key={f.key}
              className="bg-stone-50 rounded-xl px-3 py-2 space-y-1"
            >
              <label className="text-xs font-bold text-stone-700 block">
                {f.label}
              </label>
              <input
                type={f.type === "date" ? "date" : "text"}
                value={str}
                onChange={(e) => updateField(f.key, e.target.value)}
                className="field text-sm py-1.5"
                placeholder={f.type === "date" ? "" : "入力してください"}
              />
              {f.hint && (
                <p className="text-[10px] text-stone-400">{f.hint}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
