"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SetupCheckForm, {
  type SetupCheckFormInitial,
} from "./_components/SetupCheckForm";
import LineTextPreview from "./_components/LineTextPreview";
import type {
  SetupCheckRecord,
  TodaySetupContext,
  TodayShiftEntry,
} from "@/lib/setupCheck/types";

const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso + "T00:00:00");
  return `${iso}（${WEEKDAY_LABEL[d.getDay()]}）`;
}

type View =
  | { kind: "list" }
  | { kind: "form"; initial: SetupCheckFormInitial }
  | { kind: "done"; lineText: string; record: SetupCheckRecord };

export default function SetupCheckPage() {
  const [context, setContext] = useState<TodaySetupContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });

  const loadToday = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/setup-check/today");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "取得に失敗しました");
      }
      setContext(json as TodaySetupContext);
    } catch (e: any) {
      setLoadError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadToday();
  }, []);

  const startForm = (entry: TodayShiftEntry) => {
    setView({ kind: "form", initial: entry });
  };

  const startBlank = () => {
    setView({
      kind: "form",
      initial: {
        date: context?.date ?? new Date().toISOString().split("T")[0],
        location: "",
        location_id: null,
        staff_name: "",
        team_unit: 1,
        sales_target: null,
        previous_register_total: null,
        previous_check_date: null,
      },
    });
  };

  const handleSubmitted = (record: SetupCheckRecord) => {
    const lineText = record.line_text ?? "";
    setView({ kind: "done", lineText, record });
  };

  const backToList = () => {
    setView({ kind: "list" });
    loadToday();
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">設営後チェック</h1>
        <Link href="/" className="btn-secondary text-sm">
          🏠 トップ
        </Link>
      </header>

      {view.kind === "list" && (
        <>
          {loading && (
            <p className="text-sm text-stone-500">読み込み中…</p>
          )}
          {loadError && (
            <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
              ❌ {loadError}
            </div>
          )}
          {context && (
            <>
              <p className="text-sm text-stone-700">
                📅 {formatDateLabel(context.date)}
              </p>
              {context.shifts.length === 0 ? (
                <div className="card bg-stone-50 text-sm text-stone-600">
                  本日のシフトが見つかりませんでした。下のボタンから手動入力してください。
                </div>
              ) : (
                <div className="space-y-2">
                  {context.shifts.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => startForm(s)}
                      className="w-full text-left card hover:shadow-md transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="font-bold text-base">
                            {s.location || "(店舗未設定)"}
                          </div>
                          <div className="text-sm text-stone-700">
                            担当：{s.staff_name || "(未設定)"}
                            <span className="text-stone-500 ml-2">
                              ({s.team_unit}番隊)
                            </span>
                          </div>
                          <div className="text-xs text-stone-500">
                            {s.sales_target
                              ? `目標：¥${s.sales_target.toLocaleString()}`
                              : "目標：—"}
                            {" / "}
                            {s.previous_register_total !== null
                              ? `前回：¥${s.previous_register_total.toLocaleString()}（${s.previous_check_date}）`
                              : "前回データなし"}
                          </div>
                        </div>
                        <span className="text-brand text-xl font-bold">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={startBlank}
                className="btn-secondary w-full"
              >
                + 手動で店舗・担当を選んで入力
              </button>
            </>
          )}
        </>
      )}

      {view.kind === "form" && (
        <SetupCheckForm
          initial={view.initial}
          onCancel={backToList}
          onSubmitted={handleSubmitted}
        />
      )}

      {view.kind === "done" && (
        <LineTextPreview text={view.lineText} onReset={backToList} />
      )}
    </main>
  );
}
