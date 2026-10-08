"use client";

import { useState } from "react";
import Link from "next/link";
import ShiftsView, { type OpenNewShiftRequest } from "./ShiftsView";
import VenuesView from "@/app/venues/VenuesView";
import TebayaOnlyGate from "@/app/components/TebayaOnlyGate";

type Tab = "shifts" | "venues";

export default function CombinedClient({
  initialTab = "venues",
}: {
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [openNewRequest, setOpenNewRequest] =
    useState<OpenNewShiftRequest | null>(null);

  // 問い合わせ「OK」→ シフトタブに切り替えて出店予定フォームを開く
  const handleRegisterShift = (inq: {
    date: string | null;
    storeName: string;
  }) => {
    setOpenNewRequest({
      date: inq.date,
      storeName: inq.storeName,
      token: (openNewRequest?.token ?? 0) + 1,
    });
    setTab("shifts");
  };

  return (
    /**
     * ★ この画面は、よそのお店には開きません
     *   （手羽屋は印が空なので、これまでどおりそのまま出ます）。
     *   → lib/tenantScope.ts の TABLES_WITHOUT_TENANT_COLUMN
     *
     *   2026-10-08（kp242）：出店予定（shifts）の側は、印の欄ができた瞬間から
     *   お店ごとに分けて読み書きするようにしました（lib/shiftScope.ts）。
     *   それでも門を外さないのは、この画面に同居している
     *   「出店先 問い合わせ」（venue_inquiries）の棚にまだ印の欄が無く、
     *   サーバー側の出店予定の窓口（/api/shifts/publish・copy-from-last-month・
     *   shift-generator/commit）も、まだ呼び出した人のお店を見ていないためです。
     *   **門を外すのは、その2つが済んでからにしてください。**
     */
    <TebayaOnlyGate title="📅 シフト・出店先">
    <main className="max-w-md mx-auto px-4 py-5 pb-24">
      <header className="mb-4 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
        >
          🏠 トップ
        </Link>
        <h1 className="text-xl font-bold text-brand-dark">
          📅 シフト・出店先
        </h1>
        <div className="w-16" />
      </header>

      {/* タブ切替 */}
      <div className="flex rounded-xl border border-stone-300 overflow-hidden mb-4">
        <button
          onClick={() => setTab("shifts")}
          className={`flex-1 text-sm py-2.5 font-bold ${
            tab === "shifts"
              ? "bg-brand text-white"
              : "bg-white text-stone-600"
          }`}
        >
          📅 シフト
        </button>
        <button
          onClick={() => setTab("venues")}
          className={`flex-1 text-sm py-2.5 font-bold ${
            tab === "venues"
              ? "bg-brand text-white"
              : "bg-white text-stone-600"
          }`}
        >
          📞 出店先 問い合わせ
        </button>
      </div>

      {/* 両方マウントしておき、表示だけ切り替える（状態を保持） */}
      <div className={tab === "shifts" ? "" : "hidden"}>
        <ShiftsView openNewRequest={openNewRequest} />
      </div>
      <div className={tab === "venues" ? "" : "hidden"}>
        <VenuesView onRegisterShift={handleRegisterShift} />
      </div>
    </main>
    </TebayaOnlyGate>
  );
}
