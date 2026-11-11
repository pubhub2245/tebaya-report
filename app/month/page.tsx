"use client";

/**
 * 今月いくら残っているか（2026-11-11 追加）。
 * 「写真だけの日報」のお店（牟田町店など）だけが見る1画面。
 *
 * 出すもの：いま残っているお金・月末の見込み・内訳・1日平均の本数と赤字にならない目安。
 * 計算は lib/photoShop.ts の1か所。ここでは足し算・掛け算をしない。
 */

import Link from "next/link";

import { usePhotoShop, useShopMonth, yen } from "@/app/components/PhotoShopHome";

export default function MonthPage() {
  const { checking, shop } = usePhotoShop();
  const state = useShopMonth(shop);

  if (checking) {
    return (
      <main className="max-w-md mx-auto px-4 py-6">
        <p className="text-sm text-stone-500">読み込み中…</p>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="max-w-md mx-auto px-4 py-6 space-y-3">
        <h1 className="text-xl font-bold">今月の数字</h1>
        <p className="text-sm text-stone-600">この画面は、写真で日報を出すお店のものです。</p>
        <Link href="/" className="text-sm text-stone-500 underline">
          ← メニューへ
        </Link>
      </main>
    );
  }

  const month = state.kind === "ok" ? state.month : null;
  const m = state.kind === "ok" ? state.m : null;
  // 目安の線とバーの位置（目盛りは 0〜目安の2倍強）
  const scaleMax = Math.max(100, shop.breakEvenPerDay * 2);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`;

  return (
    <main className="max-w-md mx-auto px-4 py-6 min-h-screen space-y-4">
      <div>
        <Link href="/" className="text-sm text-stone-500 underline">
          ← メニューへ
        </Link>
        <h1 className="text-xl font-bold mt-3">
          {m ? `${m}月` : "今月"}
          {month ? `（日報${month.days}日分）` : ""}
        </h1>
        <p className="text-xs text-stone-500">{shop.shopName}</p>
      </div>

      {state.kind === "loading" && <p className="text-sm text-stone-500">読み込み中…</p>}
      {state.kind === "error" && (
        <p className="text-sm text-red-600">読めませんでした。電波を確かめて、開き直してください。</p>
      )}

      {month && month.days === 0 && (
        <section className="card space-y-2">
          <p className="font-bold">今月の日報はまだありません</p>
          <p className="text-sm text-stone-600">
            最初の1枚を出すと、今月いくら残っているかがここに出ます。
          </p>
          <Link
            href="/report/photo"
            className="flex items-center justify-center w-full h-14 rounded-2xl bg-orange-500 active:bg-orange-700 text-white font-bold"
          >
            写真で日報を出す
          </Link>
        </section>
      )}

      {month && month.days > 0 && (
        <>
          <section
            className={`rounded-2xl px-5 py-5 ${
              month.remaining >= 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
            }`}
          >
            <p className="text-sm">今月いま残っているお金</p>
            <p className="text-5xl font-bold mt-1">{yen(month.remaining)}</p>
            {month.forecast !== null && (
              <p className="text-sm mt-2">
                このペースで月{Math.max(shop.plannedDays, month.days)}日営業すると、月末は 約{yen(month.forecast)}
              </p>
            )}
          </section>

          <section className="card divide-y divide-stone-100">
            <Row label="売上" value={yen(month.sales)} bold />
            <Row
              label={
                month.expenseRate !== null
                  ? `仕入れなどの経費（売上の${(month.expenseRate * 100).toFixed(1)}%）`
                  : "仕入れなどの経費"
              }
              value={yen(-month.expenses)}
            />
            <Row label="人件費" value={yen(-month.labor)} />
            {shop.monthlyFixed.map((f) => (
              <Row key={f.label} label={`${f.label}（月）`} value={yen(-f.amount)} />
            ))}
          </section>

          {month.avgPrimaryPerDay !== null && (
            <section className="card space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="font-bold">1日平均の{shop.primaryProduct}</span>
                <span className="text-2xl font-bold">{month.avgPrimaryPerDay}本</span>
              </div>
              <div className="relative h-3 rounded-full bg-stone-200" aria-hidden="true">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-orange-500"
                  style={{ width: pct(month.avgPrimaryPerDay) }}
                />
                <div
                  className="absolute -top-1 -bottom-1 w-0.5 bg-stone-800"
                  style={{ left: pct(shop.breakEvenPerDay) }}
                />
              </div>
              <p className="text-xs text-stone-500">
                縦の線が、赤字にならない目安（1日{shop.breakEvenPerDay}本）です。
                {month.avgPrimaryPerDay >= shop.breakEvenPerDay ? "いまは目安を超えています。" : "いまは目安に届いていません。"}
              </p>
            </section>
          )}

          <p className="text-xs text-stone-400">
            家賃・電気・水道は、月の初めに1か月ぶんをまとめて引いています。経費はレシートを撮った分です。
          </p>
        </>
      )}
    </main>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <span className="text-stone-700">{label}</span>
      <span className={bold ? "font-bold" : ""}>{value}</span>
    </div>
  );
}
