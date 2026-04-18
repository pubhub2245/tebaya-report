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

const WEATHER_OPTIONS = [
  { value: "sunny", label: "☀️晴れ" },
  { value: "cloudy", label: "☁️曇り" },
  { value: "rainy", label: "🌧️雨" },
  { value: "windy", label: "🌬️強風" },
];

function generateTimeOptions() {
  const opts: string[] = [];
  for (let h = 8; h <= 23; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 23) opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
}
const TIME_OPTIONS = generateTimeOptions();

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function nowTimeStr(): string {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  // snap to nearest 30min
  const snapped = m < 15 ? 0 : m < 45 ? 30 : 60;
  const adjH = snapped === 60 ? h + 1 : h;
  const adjM = snapped === 60 ? 0 : snapped;
  return `${String(adjH).padStart(2, "0")}:${String(adjM).padStart(2, "0")}`;
}

// Fallback: power-curve calculation when no achievement rate data
function calcTargetAtTime(
  target: number,
  openTime: string,
  closeTime: string,
  reportTime: string
): number {
  const openMin = timeToMinutes(openTime);
  const closeMin = timeToMinutes(closeTime);
  const reportMin = timeToMinutes(reportTime);
  const totalMinutes = closeMin - openMin;
  if (totalMinutes <= 0) return 0;
  const elapsed = Math.max(0, Math.min(reportMin - openMin, totalMinutes));
  const ratio = elapsed / totalMinutes;
  return Math.round(target * Math.pow(ratio, 1.3));
}

type AchievementRate = {
  hour: number;
  rate: number;
  sample_count: number;
  is_global: boolean;
};

const TOTAL_STEPS = 5;

export default function InterimPage() {
  const [step, setStep] = useState(1);
  const [staff, setStaff] = useState("");
  const [isStaffOther, setIsStaffOther] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locId, setLocId] = useState<string>("");
  const [weather, setWeather] = useState<string[]>([]);
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("19:00");
  const [currentSales, setCurrentSales] = useState(0);
  const [reportTime, setReportTime] = useState<string>(nowTimeStr());
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [lineText, setLineText] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [achRates, setAchRates] = useState<AchievementRate[]>([]);
  const [achSampleCount, setAchSampleCount] = useState<number | null>(null);

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

  // Auto-set closeTime to openTime + 9 hours when openTime changes
  const updateCloseTimeFromOpen = (newOpen: string) => {
    const openMin = timeToMinutes(newOpen);
    const closeMin = Math.min(openMin + 9 * 60, 23 * 60); // cap at 23:00
    const h = Math.floor(closeMin / 60);
    const m = closeMin % 60;
    setCloseTime(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  };

  // Fetch achievement rates when location changes
  useEffect(() => {
    if (!locId) {
      setAchRates([]);
      setAchSampleCount(null);
      return;
    }
    const today = new Date();
    const dow = today.getDay();
    const dayType = dow === 0 || dow === 6 ? "weekend" : "weekday";

    (async () => {
      try {
        const res = await fetch(
          `/api/achievement-rates?location_id=${locId}&day_type=${dayType}`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (json.rates) {
          setAchRates(json.rates);
          const withData = json.rates.filter(
            (r: AchievementRate) => r.rate !== null && !r.is_global
          );
          if (withData.length > 0) {
            const avg = Math.round(
              withData.reduce(
                (s: number, r: AchievementRate) => s + r.sample_count,
                0
              ) / withData.length
            );
            setAchSampleCount(avg);
          } else {
            setAchSampleCount(null);
          }
        }
      } catch {}
    })();
  }, [locId]);

  // Calculate target using achievement rates if available, fallback to power curve
  const targetAtHour = useMemo(() => {
    if (!selectedLoc) return 0;
    const reportHourNum = parseInt(reportTime.split(":")[0], 10);
    // Try to find matching achievement rate
    const match = achRates.find((r) => r.hour === reportHourNum);
    if (match && match.rate !== null) {
      return Math.round(selectedLoc.target * match.rate);
    }
    // Fallback to power curve
    return calcTargetAtTime(selectedLoc.target, openTime, closeTime, reportTime);
  }, [selectedLoc, reportTime, achRates, openTime, closeTime]);
  const difference = currentSales - targetAtHour;
  const achievementRate =
    targetAtHour > 0
      ? Math.round((currentSales / targetAtHour) * 1000) / 10
      : 0;

  const weatherDisplay = weather
    .map((w) => WEATHER_OPTIONS.find((o) => o.value === w)?.label || w)
    .join(" ");

  // Generate valid report time options (between open and close)
  const reportTimeOptions = useMemo(() => {
    const openMin = timeToMinutes(openTime);
    const closeMin = timeToMinutes(closeTime);
    return TIME_OPTIONS.filter((t) => {
      const m = timeToMinutes(t);
      return m >= openMin && m <= closeMin;
    });
  }, [openTime, closeTime]);

  // Adjust reportTime if it's outside the valid range
  useEffect(() => {
    const openMin = timeToMinutes(openTime);
    const closeMin = timeToMinutes(closeTime);
    const reportMin = timeToMinutes(reportTime);
    if (reportMin < openMin) setReportTime(openTime);
    else if (reportMin > closeMin) setReportTime(closeTime);
  }, [openTime, closeTime]);

  //営業時間の計算（表示用）
  const operatingHours = useMemo(() => {
    const diff = timeToMinutes(closeTime) - timeToMinutes(openTime);
    if (diff <= 0) return "";
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  }, [openTime, closeTime]);

  const isCloseTimeValid = timeToMinutes(closeTime) > timeToMinutes(openTime);

  const canNext = () => {
    if (step === 1) return staff.trim().length > 0;
    if (step === 2) return !!selectedLoc;
    if (step === 3) return weather.length > 0 && isCloseTimeValid;
    if (step === 4) return currentSales >= 0 && !!selectedLoc;
    return true;
  };

  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  const toggleWeather = (val: string) => {
    setWeather((prev) =>
      prev.includes(val) ? prev.filter((w) => w !== val) : [...prev, val]
    );
  };

  const reportHourNum = parseInt(reportTime.split(":")[0], 10);

  const buildLineText = () => {
    if (!selectedLoc) return "";
    const sign = difference > 0 ? "+" : difference < 0 ? "-" : "";
    const diffStr = `${sign}¥${Math.abs(difference).toLocaleString("ja-JP")}`;
    return [
      `【店舗名】${selectedLoc.name}`,
      `【ランク】${selectedLoc.rank}（目標${yen(selectedLoc.target)}）`,
      `【営業時間】${openTime}〜${closeTime}（${operatingHours}営業）`,
      `【天気】${weatherDisplay}`,
      ``,
      `◾️${reportTime} 中間報告`,
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
          report_hour: reportHourNum,
          current_sales: currentSales,
          target_at_hour: targetAtHour,
          difference,
          achievement_rate: achievementRate,
          weather: weatherDisplay,
          open_time: openTime,
          close_time: closeTime,
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
    setWeather([]);
    setOpenTime("10:00");
    setCloseTime("19:00");
    setCurrentSales(0);
    setReportTime(nowTimeStr());
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
          <span>STEP {step} / {TOTAL_STEPS}</span>
          <span>
            {["担当者", "店舗", "天気・営業時間", "売上入力", "送信"][step - 1]}
          </span>
        </div>
        <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
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

      {step === 3 && (
        <section className="card space-y-4">
          <h2 className="text-lg font-bold">天気・営業時間</h2>

          <div>
            <label className="label">天気（タップで選択・複数OK）</label>
            <div className="grid grid-cols-2 gap-2">
              {WEATHER_OPTIONS.map((opt) => {
                const active = weather.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleWeather(opt.value)}
                    className={`rounded-xl py-3 text-base font-bold border-2 transition active:scale-95 ${
                      active
                        ? "bg-brand text-white border-brand"
                        : "bg-white text-stone-700 border-stone-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">開店時刻</label>
            <select
              className="field text-lg"
              value={openTime}
              onChange={(e) => {
                setOpenTime(e.target.value);
                updateCloseTimeFromOpen(e.target.value);
              }}
            >
              {TIME_OPTIONS.map((t) => (
                <option key={`open-${t}`} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">閉店予定時刻</label>
            <select
              className="field text-lg"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
            >
              {TIME_OPTIONS.filter(
                (t) => timeToMinutes(t) > timeToMinutes(openTime)
              ).map((t) => (
                <option key={`close-${t}`} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {!isCloseTimeValid && (
              <p className="text-sm text-red-600 mt-1">
                閉店時刻は開店時刻より後にしてください
              </p>
            )}
          </div>

          {isCloseTimeValid && (
            <div className="bg-stone-50 rounded-xl p-3 text-sm text-stone-600">
              営業時間：{openTime}〜{closeTime}（{operatingHours}営業）
            </div>
          )}
        </section>
      )}

      {step === 4 && selectedLoc && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">現在売上</h2>
          <div>
            <label className="label">報告時刻</label>
            <select
              className="field"
              value={reportTime}
              onChange={(e) => setReportTime(e.target.value)}
            >
              {reportTimeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
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
              <span className="text-stone-500">目安（{reportTime}）</span>
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
            {achSampleCount !== null && achSampleCount > 0 && (
              <div className="text-[11px] text-stone-400 text-right mt-1">
                （過去{achSampleCount}件の実績から算出）
              </div>
            )}
          </div>
        </section>
      )}

      {step === 5 && selectedLoc && (
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
              <span className="font-semibold">{selectedLoc.rank}（目標{yen(selectedLoc.target)}）</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">営業時間</span>
              <span className="font-semibold">{openTime}〜{closeTime}（{operatingHours}）</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">天気</span>
              <span className="font-semibold">{weatherDisplay}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">{reportTime} 現在</span>
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
                className="field font-mono text-sm min-h-[200px]"
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
            {step < TOTAL_STEPS && (
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
