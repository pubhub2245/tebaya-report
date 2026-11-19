"use client";

/**
 * スタッフ用の合言葉を変える画面（2026-11-19）。
 * 店主の合言葉を知っている人だけが変えられる（サーバーと倉庫で確かめる）。
 * 変えたあとは、前の合言葉では新しく入れない（もう入っている端末はそのまま使える）。
 */

import Link from "next/link";
import { useState } from "react";

import { usePhotoShop } from "@/app/components/PhotoShopHome";
import { validStaffCode } from "@/lib/photoShopStaffCode";

const field =
  "w-full h-14 rounded-2xl border-2 border-stone-200 px-4 text-lg focus:border-orange-500 outline-none";

export default function StaffCodePage() {
  const { checking, shop } = usePhotoShop();
  const [owner, setOwner] = useState("");
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (checking) return <main className="max-w-md mx-auto px-4 py-6 text-sm text-stone-500">読み込み中…</main>;
  if (!shop) {
    return (
      <main className="max-w-md mx-auto px-4 py-6 space-y-3">
        <p className="text-sm text-stone-600">この画面は、写真で日報を出すお店のものです。</p>
        <Link href="/" className="text-sm text-stone-500 underline">← メニューへ</Link>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validStaffCode(code)) return setError("新しい合言葉は、半角の数字か英字で4〜12文字にしてください。");
    if (code !== again) return setError("新しい合言葉が2回とも同じになっていません。");
    setState("sending");
    try {
      const res = await fetch("/api/shop/staff-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: shop.tenantId, ownerPassword: owner, newCode: code }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setState("done");
        return;
      }
      setError(json?.message ?? "変えられませんでした。");
    } catch {
      setError("通信できませんでした。電波を確かめてもう一度押してください。");
    }
    setState("idle");
  };

  if (state === "done") {
    return (
      <main className="max-w-md mx-auto px-4 py-10 space-y-4">
        <h1 className="text-2xl font-bold">変えました</h1>
        <p className="text-[15px] text-stone-700">
          これからお店に入る人は、新しい合言葉を使います。前の合言葉ではもう入れません。
          すでに入っているスマホは、そのまま使えます。
        </p>
        <Link href="/" className="block text-center h-14 leading-[56px] rounded-2xl bg-orange-500 text-white text-lg font-bold">
          メニューへ戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-5">
      <Link href="/month" className="text-sm text-stone-500 underline">← 戻る</Link>
      <h1 className="text-2xl font-bold">スタッフの合言葉を変える</h1>
      <p className="text-[15px] text-stone-600">
        お店で働く人が最初に入れる合言葉です（入口は tebaya-report.vercel.app/join）。
      </p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          <span className="font-bold">店主の合言葉</span>
          <input type="password" className={field} value={owner} onChange={(e) => setOwner(e.target.value)} autoComplete="off" />
        </label>
        <label className="block space-y-1">
          <span className="font-bold">新しいスタッフの合言葉</span>
          <span className="block text-sm text-stone-500">半角の数字か英字で4〜12文字</span>
          <input className={field} value={code} onChange={(e) => setCode(e.target.value.trim())} inputMode="numeric" autoComplete="off" />
        </label>
        <label className="block space-y-1">
          <span className="font-bold">もう一度</span>
          <input className={field} value={again} onChange={(e) => setAgain(e.target.value.trim())} inputMode="numeric" autoComplete="off" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={state === "sending" || !owner || !code || !again}
          className="w-full h-14 rounded-2xl bg-orange-500 active:bg-orange-700 disabled:opacity-50 text-white text-lg font-bold"
        >
          {state === "sending" ? "変えています…" : "変える"}
        </button>
      </form>
    </main>
  );
}
