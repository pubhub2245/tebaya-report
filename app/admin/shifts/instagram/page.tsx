"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { shortLocationName, isSpecialEvent } from "@/lib/locationDisplay";
import AdminGate from "@/app/components/AdminGate";

// TODO: 将来追加予定の機能
// - Instagram投稿用テンプレートのカスタマイズ機能

type Shift = {
  id: number;
  date: string;
  location_id: number;
  rank: string;
  target: number;
  staff_name: string | null;
  status: string;
  locations?: { name: string } | null;
};

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export default function InstagramShiftsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(year, month, 0).getDate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("shifts")
        .select("*, locations(name)")
        .gte("date", `${monthStr}-01`)
        .lte("date", `${monthStr}-${lastDay}`)
        .neq("status", "cancelled")
        .order("date");
      setShifts((data as Shift[]) || []);
      setLoading(false);
    })();
  }, [year, month]);

  // カレンダー週配列
  const calendarWeeks = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startDow = first.getDay();
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= lastDay; d++) {
      week.push(d);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [year, month, lastDay]);

  // 日ごとのシフト
  const shiftsByDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      const arr = m.get(s.date) || [];
      arr.push(s);
      m.set(s.date, arr);
    }
    return m;
  }, [shifts]);

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  const dateStr = (day: number) =>
    `${monthStr}-${String(day).padStart(2, "0")}`;

  /** セルの背景スタイルを決定 */
  const cellStyle = (dayShifts: Shift[]): React.CSSProperties => {
    if (dayShifts.length === 0)
      return { background: "rgba(255,255,255,0.4)" };

    const hasHighRank = dayShifts.some(
      (s) => s.rank === "A" || s.rank === "B",
    );
    const hasSpecial = dayShifts.some((s) => {
      const name = (s.locations as any)?.name || "";
      return isSpecialEvent(name);
    });

    if (hasSpecial)
      return {
        background: "linear-gradient(135deg, #FF6B6B 0%, #FF3D7F 100%)",
        color: "#fff",
      };
    if (hasHighRank)
      return {
        background: "linear-gradient(135deg, #FFD93D 0%, #FF9A3C 100%)",
        color: "#fff",
      };
    return { background: "#fff", color: "#D85A30" };
  };

  const igContent = (
    <div
      style={{
        width: "100%",
        maxWidth: 540,
        aspectRatio: "1 / 1",
        background: "linear-gradient(135deg, #FFF5E6 0%, #FFE4D6 100%)",
        borderRadius: 24,
        padding: "20px 16px 16px",
        position: "relative",
        overflow: "hidden",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif',
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 装飾円 */}
      <div
        style={{
          position: "absolute",
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "rgba(255, 217, 61, 0.25)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: -40,
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: "rgba(255, 107, 107, 0.15)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "45%",
          right: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "rgba(0, 206, 209, 0.12)",
        }}
      />

      {/* ヘッダー */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 8,
          position: "relative",
          zIndex: 1,
        }}
      >
        <span
          style={{
            display: "inline-block",
            background: "#fff",
            color: "#D85A30",
            fontWeight: 800,
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 20,
            marginBottom: 4,
          }}
        >
          🍗 手羽屋
        </span>
        <div
          style={{
            color: "#993C1D",
            fontSize: 24,
            fontWeight: 900,
            lineHeight: 1.2,
          }}
        >
          {year}年 {month}月
        </div>
        <div
          style={{
            color: "#B45309",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.3em",
            marginTop: 2,
          }}
        >
          出 店 ス ケ ジ ュ ー ル
        </div>
      </div>

      {/* カレンダー */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* 曜日ヘッダー */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {DAY_NAMES.map((d, i) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                fontSize: 9,
                fontWeight: 800,
                padding: "2px 0",
                color: i === 0 ? "#DC2626" : i === 6 ? "#2563EB" : "#78716C",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 日付セル */}
        {calendarWeeks.map((week, wi) => (
          <div
            key={wi}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
              flex: 1,
            }}
          >
            {week.map((day, di) => {
              if (day === null) {
                return (
                  <div
                    key={di}
                    style={{
                      background: "rgba(255,255,255,0.2)",
                      borderRadius: 6,
                    }}
                  />
                );
              }
              const ds = dateStr(day);
              const dayShifts = shiftsByDate.get(ds) || [];
              const style = cellStyle(dayShifts);
              const isWhiteBg = !style.color || style.color !== "#fff";

              const hasHighRank = dayShifts.some(
                (s) => s.rank === "A" || s.rank === "B",
              );
              const hasSpecial = dayShifts.some((s) =>
                isSpecialEvent((s.locations as any)?.name || ""),
              );

              return (
                <div
                  key={di}
                  style={{
                    ...style,
                    borderRadius: 6,
                    padding: "3px 2px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    boxShadow: dayShifts.length > 0
                      ? "0 2px 4px rgba(0,0,0,0.06)"
                      : "none",
                    minHeight: 0,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      color: isWhiteBg
                        ? di === 0
                          ? "#DC2626"
                          : di === 6
                            ? "#2563EB"
                            : "#44403C"
                        : "#fff",
                    }}
                  >
                    {day}
                  </div>
                  {dayShifts.length > 0 && (
                    <div
                      style={{
                        fontSize: dayShifts.length > 2 ? 8 : 10,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        textAlign: "center",
                        color: isWhiteBg ? "#D85A30" : "#fff",
                        wordBreak: "break-word",
                        width: "100%",
                      }}
                    >
                      {hasSpecial && "🎉"}
                      {!hasSpecial && hasHighRank && "★"}
                      {dayShifts.map((s, si) => (
                        <div key={si} style={{ lineHeight: 1.15 }}>
                          {shortLocationName(
                            (s.locations as any)?.name || "",
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 凡例 */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          marginTop: 6,
          fontSize: 8,
          fontWeight: 700,
          color: "#78716C",
          position: "relative",
          zIndex: 1,
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 3,
              background: "linear-gradient(135deg, #FFD93D, #FF9A3C)",
              verticalAlign: "middle",
              marginRight: 3,
            }}
          />
          ★ 人気店舗
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 3,
              background: "linear-gradient(135deg, #FF6B6B, #FF3D7F)",
              verticalAlign: "middle",
              marginRight: 3,
            }}
          />
          🎉 特別出店
        </span>
      </div>

      {/* フッター */}
      <div
        style={{
          textAlign: "center",
          marginTop: 6,
          position: "relative",
          zIndex: 1,
        }}
      >
        <span
          style={{
            display: "inline-block",
            background: "#fff",
            color: "#78716C",
            fontSize: 8,
            fontWeight: 600,
            padding: "3px 14px",
            borderRadius: 20,
          }}
        >
          📍 都城市内&nbsp;&nbsp;|&nbsp;&nbsp;@tebaya_official
        </span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <AdminGate>
        <main className="max-w-xl mx-auto px-4 py-6">
          <p className="text-center text-stone-500 py-16">読み込み中…</p>
        </main>
      </AdminGate>
    );
  }

  // フルスクリーンモード
  if (fullscreen) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f4",
          padding: 8,
        }}
      >
        <div style={{ width: "100%", maxWidth: 540 }}>{igContent}</div>
        <button
          onClick={() => setFullscreen(false)}
          style={{
            marginTop: 12,
            padding: "8px 24px",
            background: "#44403C",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ✕ 閉じる
        </button>
      </div>
    );
  }

  return (
    <AdminGate>
      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        <header className="flex items-center justify-between gap-2">
          <Link href="/admin/shifts" className="btn-secondary text-sm">
            ← 通常モードへ戻る
          </Link>
          <h1 className="text-lg font-bold text-brand-dark">
            📷 Instagram投稿モード
          </h1>
        </header>

        {/* 月切替 */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={prevMonth}
            className="text-2xl px-3 py-1 rounded-lg hover:bg-stone-100"
          >
            ◀
          </button>
          <span className="text-xl font-bold text-brand-dark">
            {year}年{month}月
          </span>
          <button
            onClick={nextMonth}
            className="text-2xl px-3 py-1 rounded-lg hover:bg-stone-100"
          >
            ▶
          </button>
        </div>

        {/* フルスクリーンボタン */}
        <button
          onClick={() => setFullscreen(true)}
          className="w-full bg-stone-700 hover:bg-stone-800 text-white font-bold py-3 rounded-xl text-sm"
        >
          📱 スクショ用フルスクリーン表示
        </button>

        {/* プレビュー */}
        <div className="flex justify-center">{igContent}</div>

        <div className="card text-xs text-stone-500 space-y-1">
          <p className="font-bold text-stone-700">スクショの撮り方</p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>「スクショ用フルスクリーン表示」ボタンを押す</li>
            <li>スマホのスクリーンショットを撮影</li>
            <li>そのままInstagramのフィード投稿に使えます</li>
          </ol>
        </div>
      </main>
    </AdminGate>
  );
}
