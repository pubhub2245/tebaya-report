"use client";

import { useState } from "react";
import Link from "next/link";
import ShiftsView, { type OpenNewShiftRequest } from "./ShiftsView";
import VenuesView from "@/app/venues/VenuesView";

type Tab = "shifts" | "venues";

export default function CombinedClient({
  initialTab = "shifts",
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
  );
}
