"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  getPrepSettings,
  type PrepSettings,
} from "@/lib/prepHelpers";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type FormState = {
  hourly_rate: number;
  monthly_target_hours: number;
  monthly_salary: number;
  direct_cost_warning_threshold: number; // 0.0〜1.0
  direct_cost_target_threshold: number;
  direct_cost_ideal_threshold: number;
};

function fromCurrent(s: PrepSettings | null): FormState {
  return {
    hourly_rate: s?.hourly_rate ?? 1000,
    monthly_target_hours: s?.monthly_target_hours ?? 200,
    monthly_salary: s?.monthly_salary ?? 200000,
    direct_cost_warning_threshold: Number(s?.direct_cost_warning_threshold ?? 0.85),
    direct_cost_target_threshold: Number(s?.direct_cost_target_threshold ?? 0.9),
    direct_cost_ideal_threshold: Number(s?.direct_cost_ideal_threshold ?? 0.95),
  };
}

export default function PrepSettingsManager() {
  const [current, setCurrent] = useState<PrepSettings | null>(null);
  const [form, setForm] = useState<FormState>(fromCurrent(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const reload = async () => {
    setLoading(true);
    const s = await getPrepSettings(todayIso());
    setCurrent(s);
    setForm(fromCurrent(s));
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  // バリデーション
  const errors: string[] = [];
  if (
    form.direct_cost_warning_threshold >= form.direct_cost_target_threshold ||
    form.direct_cost_target_threshold >= form.direct_cost_ideal_threshold
  ) {
    errors.push("警告 < 目標 < 理想 の順序を守ってください");
  }
  for (const v of [
    form.direct_cost_warning_threshold,
    form.direct_cost_target_threshold,
    form.direct_cost_ideal_threshold,
  ]) {
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      errors.push("閾値は 0.0〜1.0 の範囲で入力してください");
      break;
    }
  }
  if (form.hourly_rate <= 0) errors.push("時給は 0 より大きい必要があります");
  if (form.monthly_target_hours <= 0) errors.push("月次目標時間は 0 より大きい必要があります");
  if (form.monthly_salary <= 0) errors.push("月給は 0 より大きい必要があります");

  const handleSave = async () => {
    if (errors.length > 0) {
      setFeedback({ kind: "err", text: errors[0] });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      // 新しい effective_from = 今日 で INSERT（既存レコードは温存）
      const { error } = await supabase.from("prep_settings").insert({
        effective_from: todayIso(),
        hourly_rate: form.hourly_rate,
        monthly_target_hours: form.monthly_target_hours,
        monthly_salary: form.monthly_salary,
        direct_cost_warning_threshold: form.direct_cost_warning_threshold,
        direct_cost_target_threshold: form.direct_cost_target_threshold,
        direct_cost_ideal_threshold: form.direct_cost_ideal_threshold,
      });
      if (error) throw error;
      setFeedback({
        kind: "ok",
        text: `新しい設定を保存しました（effective_from: ${todayIso()}）`,
      });
      await reload();
    } catch (e: any) {
      setFeedback({ kind: "err", text: e?.message || "保存失敗" });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-xl font-bold text-brand-dark">⚙️ 仕込み日報の設定</h2>
      <p className="text-xs text-stone-600">
        時給・月給目安・直接費比率の閾値を設定します。「保存」を押すと新しい effective_from
        （今日）でレコードを INSERT し、過去の設定は温存されます（過去月の評価は当時の閾値で）。
      </p>

      {loading ? (
        <p className="text-sm text-stone-500">読み込み中…</p>
      ) : (
        <>
          {current && (
            <div className="text-xs bg-stone-50 rounded-lg p-2">
              現在の有効設定: effective_from{" "}
              <strong>{current.effective_from}</strong>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="label text-sm">時給（円）</label>
              <input
                type="number"
                min={0}
                value={form.hourly_rate}
                onChange={(e) =>
                  setForm({
                    ...form,
                    hourly_rate: parseInt(e.target.value || "0", 10),
                  })
                }
                className="field text-sm"
                disabled={saving}
              />
            </div>
            <div>
              <label className="label text-sm">月次目標時間</label>
              <input
                type="number"
                min={0}
                value={form.monthly_target_hours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    monthly_target_hours: parseInt(e.target.value || "0", 10),
                  })
                }
                className="field text-sm"
                disabled={saving}
              />
            </div>
            <div>
              <label className="label text-sm">月給目安（円）</label>
              <input
                type="number"
                min={0}
                value={form.monthly_salary}
                onChange={(e) =>
                  setForm({
                    ...form,
                    monthly_salary: parseInt(e.target.value || "0", 10),
                  })
                }
                className="field text-sm"
                disabled={saving}
              />
            </div>
          </div>

          <div className="border-t border-stone-200 pt-3 space-y-2">
            <div className="text-sm font-bold text-stone-700">
              直接費比率の閾値
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["direct_cost_warning_threshold", "警告ライン", "red"],
                ["direct_cost_target_threshold", "目標ライン", "yellow"],
                ["direct_cost_ideal_threshold", "理想ライン", "emerald"],
              ] as const).map(([key, label, color]) => {
                const colorMap: Record<string, string> = {
                  red: "border-red-300",
                  yellow: "border-yellow-400",
                  emerald: "border-emerald-300",
                };
                const v = form[key];
                return (
                  <div
                    key={key}
                    className={`border rounded-lg p-2 ${colorMap[color]}`}
                  >
                    <label className="text-xs font-bold text-stone-700 block mb-1">
                      {label}
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(v * 100)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            [key]: parseInt(e.target.value || "0", 10) / 100,
                          })
                        }
                        className="field text-sm py-1 text-right"
                        disabled={saving}
                      />
                      <span className="text-xs text-stone-500">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-3 py-2 text-sm font-semibold">
              ❌ {errors[0]}
            </div>
          )}

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

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || errors.length > 0}
            className="btn-primary w-full text-sm"
          >
            {saving ? "保存中…" : "新しい設定を保存"}
          </button>
        </>
      )}
    </section>
  );
}
