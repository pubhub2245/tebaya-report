"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";
import { STAFF_OPTIONS } from "@/lib/formState";

type Location = {
  id: string | number;
  name: string;
  rank: string;
  target: number;
  is_active: boolean;
};

const HOUR_PCT: Record<number, number> = {
  11: 1.1,
  13: 16.5,
  15: 28.6,
  17: 47.9,
  19: 83.2,
  20: 100,
};
const HOURS = [11, 13, 15, 17, 19, 20];

function detectHour(d: Date): number {
  const t = d.getHours() * 60 + d.getMinutes();
  if (t >= 10 * 60 && t <= 12 * 60) return 11;
  if (t >= 12 * 60 + 1 && t <= 14 * 60) return 13;
  if (t >= 14 * 60 + 1 && t <= 16 * 60) return 15;
  if (t >= 16 * 60 + 1 && t <= 18 * 60) return 17;
  if (t >= 18 * 60 + 1 && t <= 20 * 60) return 19;
  if (t >= 20 * 60 + 1 && t <= 22 * 60) return 20;
  return 11;
}

export default function InterimPage() {
  const [step, setStep] = useState(1);
  const [staff, setStaff] = useState("");
  const [isStaffOther, setIsStaffOther] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locId, setLocId] = useState<string>("");
  const [currentSales, setCurrentSales] = useState(0);
  const [reportHour, setReportHour] = useState<number>(detectHour(new Date()));
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [lineText, setLineText] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, rank, target, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) setError(error.message);
      else setLocations((data as Location[]) || []);
    })();
  }, []);

  const selectedLoc = useMemo(
    () => locations.find((l) => String(l.id) === locId) || null,
    [locations, locId]
  );

  const pct = HOUR_PCT[reportHour] ?? 0;
  const targetAtHour = selectedLoc
    ? Math.round((selectedLoc.target * pct) / 100)
    : 0;
  const difference = currentSales - targetAtHour;
  const achievementRate =
    targetAtHour > 0
      ? Math.round((currentSales / targetAtHour) * 1000) / 10
      : 0;

  const canNext = () => {
    if (step === 1) return staff.trim().length > 0;
    if (step === 2) return !!selectedLoc;
    if (step === 3) return currentSales >= 0 && !!selectedLoc;
    return true;
  };

  const goNext = () => setStep((s) => Math.min(4, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  const buildLineText = () => {
    if (!selectedLoc) return "";
    const sign = difference > 0 ? "+" : difference < 0 ? "-" : "";
    const diffStr = `${sign}¥${Math.abs(difference).toLocaleString("ja-JP")}`;
    return [
      `店舗名：${selectedLoc.name}`,
      `ランク：${selectedLoc.rank}`,
      `◾️${reportHour}時中間報告`,
      `現在：${yen(currentSales)}`,
      `目安：${yen(targetAtHour)}`,
      `差額：${diffStr}`,
    ].join("\n");
  };

  const handleSave = async () => {
    if (!selectedLoc) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("interim_reports")
        .insert({
          location: selectedLoc.name,
          rank: selectedLoc.rank,
          target: selectedLoc.target,
          staff_name: staff,
          report_hour: reportHour,
          current_sales: currentSales,
          target_at_hour: targetAtHour,
          difference,
          achievement_rate: achievementRate,
        })
        .select("id")
        .single();
      if (error) throw error;
      setSavedId(data.id);
      setLineText(buildLineText());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lineText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const reset = () => {
    setStep(1);
    setStaff("");
    setIsStaffOther(false);
    setLocId("");
    setCurrentSales(0);
    setReportHour(detectHour(new Date()));
    setSavedId(null);
    setLineText("");
    setError(null);
  };

  return (
    <main className="max-w-md mx-auto px-4 py-5 pb-32">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
          >
            🏠 トップ
          </Link>
          <Link
            href="/report"
            className="inline-flex items-center gap-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-base px-3 py-2"
          >
            📋 日報へ
          </Link>
        </div>
        <h1 className="text-xl font-bold text-brand-dark text-center">
          中間報告
        </h1>
      </header>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-stone-600 mb-1">
          <span>STEP {step} / 4</span>
          <span>
            {["担当者", "店舗", "売上入力", "送信"][step - 1]}
          </span>
        </div>
        <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {step === 1 && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">担当者</h2>
          <select
            className="field"
            value={isStaffOther ? "__other__" : staff}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__other__") {
                setIsStaffOther(true);
                setStaff("");
              } else {
                setIsStaffOther(false);
                setStaff(v);
              }
            }}
          >
            <option value="">選択してください</option>
            {STAFF_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="__other__">その他（手入力）</option>
          </select>
          {isStaffOther && (
            <input
              className="field"
              placeholder="担当者名を入力"
              value={staff}
              onChange={(e) => setStaff(e.target.value)}
            />
          )}
        </section>
      )}

      {step === 2 && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">店舗</h2>
          <select
            className="field"
            value={locId}
            onChange={(e) => setLocId(e.target.value)}
          >
            <option value="">選択してください</option>
            {locations.map((l) => (
              <option key={String(l.id)} value={String(l.id)}>
                {l.name}
              </option>
            ))}
          </select>
          {selectedLoc && (
            <div className="bg-stone-50 rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">ランク</span>
                <span className="font-semibold">{selectedLoc.rank}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">目標金額</span>
                <span className="font-semibold">{yen(selectedLoc.target)}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {step === 3 && selectedLoc && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">現在売上</h2>
          <div>
            <label className="label">報告時間</label>
            <select
              className="field"
              value={reportHour}
              onChange={(e) => setReportHour(parseInt(e.target.value, 10))}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}時（目標の{HOUR_PCT[h]}%）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">現在売上</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
                ¥
              </span>
              <input
                type="number"
                inputMode="numeric"
                className="field pl-8 text-right text-2xl font-bold"
                value={currentSales}
                min={0}
                onChange={(e) => {
                  const v = parseInt(e.target.value || "0", 10);
                  setCurrentSales(v < 0 ? 0 : v);
                }}
                placeholder="0"
              />
            </div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-500">目安（{reportHour}時）</span>
              <span className="font-semibold">{yen(targetAtHour)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">差額</span>
              <span
                className={`font-semibold ${
                  difference >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {yen(difference)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">達成率</span>
              <span className="font-semibold">{achievementRate}%</span>
            </div>
          </div>
        </section>
      )}

      {step === 4 && selectedLoc && (
        <section className="space-y-4">
          <div className="card space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-500">担当</span>
              <span className="font-semibold">{staff}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">店舗</span>
              <span className="font-semibold">{selectedLoc.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">ランク</span>
              <span className="font-semibold">{selectedLoc.rank}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">{reportHour}時 現在</span>
              <span className="font-semibold">{yen(currentSales)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">目安</span>
              <span className="font-semibold">{yen(targetAtHour)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">差額</span>
              <span
                className={`font-semibold ${
                  difference >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {yen(difference)}
              </span>
            </div>
          </div>

          {!savedId ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary w-full"
            >
              {saving ? "保存中…" : "保存して報告テキスト生成"}
            </button>
          ) : (
            <div className="card space-y-3">
              <textarea
                readOnly
                value={lineText}
                className="field font-mono text-sm min-h-[180px]"
              />
              <button onClick={handleCopy} className="btn-primary w-full">
                {copied ? "コピー済み ✓" : "LINEテキストをコピー"}
              </button>
              <button onClick={reset} className="btn-secondary w-full">
                新しい中間報告を入力
              </button>
            </div>
          )}
        </section>
      )}

      {!savedId && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-3">
          <div className="max-w-md mx-auto flex gap-2">
            <button
              onClick={goPrev}
              disabled={step === 1}
              className="btn-secondary flex-1 disabled:opacity-30"
            >
              戻る
            </button>
            {step < 4 && (
              <button
                onClick={goNext}
                disabled={!canNext()}
                className="btn-primary flex-[2]"
              >
                次へ
              </button>
            )}
          </div>
        </nav>
      )}
    </main>
  );
}
