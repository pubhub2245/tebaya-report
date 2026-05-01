"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { businessDateStr, slashDate } from "@/lib/format";
import { STAFF_OPTIONS } from "@/lib/formState";
import { getUnitFromStaff } from "@/lib/teamMapping";
import {
  CANCELLATION_REASONS,
  type CancellationReasonKey,
} from "@/lib/cancellation/constants";
import { createCancellation } from "@/lib/cancellation/db";

const LOCATION_FALLBACK_OPTIONS = [
  "ながやま 鷹尾店",
  "ながやま 若葉店",
  "ながやま 三股店",
  "ながやま 都北店",
  "ながやま 山田店",
  "ながやま 志比田店",
  "マンガ倉庫",
  "PASIO高城店",
  "PASIO早鈴店",
  "ニクルの朝市",
  "まるまる朝市",
  "BIG OPUS",
  "Aコープ木花",
  "イオンモール",
];

type ShiftRow = {
  staff_name: string | null;
  locations: { name: string } | null;
};

export default function CancelPage() {
  const router = useRouter();

  const [businessDate, setBusinessDate] = useState<string>(businessDateStr());

  const [shiftLocations, setShiftLocations] = useState<string[]>([]);
  const [shiftStaffByLocation, setShiftStaffByLocation] = useState<
    Record<string, string[]>
  >({});
  const [shiftsLoaded, setShiftsLoaded] = useState(false);

  const [location, setLocation] = useState("");
  const [locationManual, setLocationManual] = useState(false);

  const [staffNameRaw, setStaffNameRaw] = useState("");
  const [staffManual, setStaffManual] = useState(false);

  const [reasons, setReasons] = useState<CancellationReasonKey[]>([]);
  const [reasonOther, setReasonOther] = useState("");
  const [note, setNote] = useState("");
  const [canceledBy, setCanceledBy] = useState("");
  const [canceledByManual, setCanceledByManual] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 業務日が変わるたびにshiftsを取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setShiftsLoaded(false);
      const { data, error: shiftErr } = await supabase
        .from("shifts")
        .select("staff_name, locations(name)")
        .eq("date", businessDate);
      if (cancelled) return;
      if (shiftErr) {
        console.warn("[cancel] shifts fetch error:", shiftErr);
      }
      const rows = ((data as unknown) as ShiftRow[]) || [];
      const locSet = new Set<string>();
      const staffByLoc: Record<string, Set<string>> = {};
      for (const r of rows) {
        const locName = r.locations?.name;
        if (!locName) continue;
        locSet.add(locName);
        if (!staffByLoc[locName]) staffByLoc[locName] = new Set<string>();
        if (r.staff_name) {
          if (r.staff_name.includes("&")) {
            r.staff_name.split("&").forEach((n) => {
              const trimmed = n.trim();
              if (trimmed) staffByLoc[locName].add(trimmed);
            });
          } else {
            staffByLoc[locName].add(r.staff_name.trim());
          }
        }
      }
      const locArr = Array.from(locSet).sort();
      const staffObj: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(staffByLoc)) {
        staffObj[k] = Array.from(v).sort();
      }
      setShiftLocations(locArr);
      setShiftStaffByLocation(staffObj);
      setShiftsLoaded(true);
      // shiftsが0件なら手動入力モードに自動切替
      if (locArr.length === 0) {
        setLocationManual(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessDate]);

  // 場所選択肢（shiftsから取得できればそれ、無ければフォールバック）
  const locationOptions = useMemo(() => {
    if (shiftLocations.length > 0) return shiftLocations;
    return LOCATION_FALLBACK_OPTIONS;
  }, [shiftLocations]);

  // 担当者選択肢（その場所のshift担当者）
  const staffOptions = useMemo(() => {
    if (location && shiftStaffByLocation[location]?.length) {
      return shiftStaffByLocation[location];
    }
    return STAFF_OPTIONS;
  }, [location, shiftStaffByLocation]);

  const toggleReason = (key: CancellationReasonKey) => {
    setReasons((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const isOtherChecked = reasons.includes("other");

  const canSubmit =
    !!businessDate &&
    !!location.trim() &&
    !!staffNameRaw.trim() &&
    reasons.length > 0 &&
    (!isOtherChecked || !!reasonOther.trim()) &&
    !!canceledBy.trim() &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const dateLabel = slashDate(businessDate);
    const ok = confirm(
      `${dateLabel} ${location}（${staffNameRaw}）の出店中止を記録します。よろしいですか？`,
    );
    if (!ok) return;

    setSubmitting(true);
    setError(null);
    try {
      const inferredUnit = getUnitFromStaff(staffNameRaw);
      const inserted = await createCancellation({
        business_date: businessDate,
        location: location.trim(),
        staff_name_raw: staffNameRaw.trim(),
        unit_number: inferredUnit ? String(inferredUnit) : null,
        cancellation_reasons: reasons,
        reason_other: isOtherChecked ? reasonOther.trim() : null,
        note: note.trim() || null,
        canceled_by: canceledBy.trim(),
      });

      // LINE通知（失敗しても登録自体は成功扱い）
      try {
        await fetch("/api/cancellation/notify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            business_date: inserted.business_date,
            location: inserted.location,
            staff_name_raw: inserted.staff_name_raw,
            cancellation_reasons: inserted.cancellation_reasons,
            reason_other: inserted.reason_other,
            canceled_by: inserted.canceled_by,
            created_at: inserted.created_at,
          }),
        });
      } catch (notifyErr) {
        console.warn(
          "[cancel] LINE通知に失敗しましたが登録は成功しています",
          notifyErr,
        );
      }

      setToast("中止を記録しました");
      setTimeout(() => router.push("/report"), 1500);
    } catch (e: any) {
      setError(e?.message || String(e));
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-5 pb-24">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <a
            href="/report"
            className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
          >
            ← 営業後日報へ戻る
          </a>
        </div>
        <h1 className="text-xl font-bold text-red-700 text-center">
          ⚠️ 出店中止を登録
        </h1>
        <p className="text-xs text-stone-500 text-center mt-1">
          雨・強風・台風等で当日の出店を中止した場合に登録してください
        </p>
      </header>

      <section className="card space-y-4">
        <div>
          <label className="label">業務日</label>
          <input
            type="date"
            className="field"
            value={businessDate}
            onChange={(e) => {
              setBusinessDate(e.target.value);
              // 日付変更時は店舗・担当者をリセット
              setLocation("");
              setStaffNameRaw("");
              setLocationManual(false);
              setStaffManual(false);
            }}
          />
        </div>

        <div>
          <label className="label">出店場所</label>
          {!locationManual ? (
            <select
              className="field"
              value={location}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__manual__") {
                  setLocationManual(true);
                  setLocation("");
                } else {
                  setLocation(v);
                  setStaffNameRaw("");
                  setStaffManual(false);
                }
              }}
            >
              <option value="">選択してください</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
              <option value="__manual__">その他（手入力）</option>
            </select>
          ) : (
            <div className="space-y-2">
              <input
                className="field"
                placeholder="出店場所を入力"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <button
                type="button"
                className="text-xs text-stone-500 underline"
                onClick={() => {
                  setLocationManual(false);
                  setLocation("");
                }}
              >
                ↩ 一覧から選び直す
              </button>
            </div>
          )}
          {shiftsLoaded && shiftLocations.length === 0 && (
            <p className="mt-1 text-xs text-stone-500">
              この日のシフト登録は無いので、手入力モードです。
            </p>
          )}
        </div>

        <div>
          <label className="label">中止対象の担当者</label>
          {!staffManual ? (
            <select
              className="field"
              value={staffNameRaw}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__manual__") {
                  setStaffManual(true);
                  setStaffNameRaw("");
                } else {
                  setStaffNameRaw(v);
                }
              }}
            >
              <option value="">選択してください</option>
              {staffOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="__manual__">その他（手入力）</option>
            </select>
          ) : (
            <div className="space-y-2">
              <input
                className="field"
                placeholder="担当者名を入力"
                value={staffNameRaw}
                onChange={(e) => setStaffNameRaw(e.target.value)}
              />
              <button
                type="button"
                className="text-xs text-stone-500 underline"
                onClick={() => {
                  setStaffManual(false);
                  setStaffNameRaw("");
                }}
              >
                ↩ 一覧から選び直す
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="label">中止理由（複数選択可）</label>
          <div className="grid grid-cols-2 gap-2">
            {CANCELLATION_REASONS.map((r) => {
              const checked = reasons.includes(r.key);
              return (
                <label
                  key={r.key}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-3 cursor-pointer ${
                    checked
                      ? "bg-red-50 border-red-400 text-red-800 font-bold"
                      : "bg-white border-stone-300 text-stone-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleReason(r.key)}
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {isOtherChecked && (
          <div>
            <label className="label">「その他」の内容</label>
            <input
              className="field"
              placeholder="例：道路通行止め"
              value={reasonOther}
              onChange={(e) => setReasonOther(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label">補足メモ（任意）</label>
          <textarea
            className="field min-h-[80px]"
            placeholder="現場の状況など"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div>
          <label className="label">登録した人（あなたの名前）</label>
          {!canceledByManual ? (
            <select
              className="field"
              value={canceledBy}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__manual__") {
                  setCanceledByManual(true);
                  setCanceledBy("");
                } else {
                  setCanceledBy(v);
                }
              }}
            >
              <option value="">選択してください</option>
              {STAFF_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="__manual__">その他（手入力）</option>
            </select>
          ) : (
            <div className="space-y-2">
              <input
                className="field"
                placeholder="あなたの名前"
                value={canceledBy}
                onChange={(e) => setCanceledBy(e.target.value)}
              />
              <button
                type="button"
                className="text-xs text-stone-500 underline"
                onClick={() => {
                  setCanceledByManual(false);
                  setCanceledBy("");
                }}
              >
                ↩ 一覧から選び直す
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-300 p-3 text-sm text-red-800">
            ❌ 登録に失敗しました：{error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl px-6 py-4 text-lg shadow active:scale-95 transition"
        >
          {submitting ? "登録中…" : "⚠️ 出店中止を登録する"}
        </button>
      </section>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center pointer-events-none">
          <div className="rounded-xl bg-green-600 text-white font-bold px-5 py-3 shadow-lg">
            ✅ {toast}
          </div>
        </div>
      )}
    </main>
  );
}
