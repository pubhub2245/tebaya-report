/**
 * 使う備品・材料の一覧（2026-11-11 追加）。
 * 買い出しのときに、写真で「どれを買えばいいか」を確かめるためのページ。
 * 中身は lib/supplies.ts の一覧だけ。倉庫（データ）は読まない。
 */

import Link from "next/link";

import { SUPPLY_GROUPS, SUPPLY_PHOTO_DATE, supplyCount } from "@/lib/supplies";

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

export const metadata = { title: "使う備品・材料" };

export default function SuppliesPage() {
  const [y, m, d] = SUPPLY_PHOTO_DATE.split("-").map(Number);
  return (
    <main className="max-w-md mx-auto px-4 py-6 min-h-screen space-y-5">
      <div>
        <Link href="/" className="text-sm text-stone-500 underline">
          ← メニューへ
        </Link>
        <h1 className="text-xl font-bold mt-3">使う備品・材料（{supplyCount()}点）</h1>
        <p className="text-xs text-stone-500">
          値段は {y}年{m}月{d}日に撮った棚札のものです。いまの値段とは違うことがあります。
        </p>
      </div>

      {SUPPLY_GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-sm font-bold text-stone-500">{group.title}</h2>
          {group.items.map((item) => (
            <article
              key={item.id}
              className="flex gap-3 rounded-2xl bg-white border border-stone-200 p-3 shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/supplies/${item.id}.jpg`}
                alt={item.name}
                width={96}
                height={128}
                loading="lazy"
                className="w-24 h-32 object-cover rounded-xl bg-stone-100 flex-none"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-bold leading-snug">{item.name}</p>
                <p className="text-xs text-stone-500">{item.detail}</p>
                <p className="text-sm text-stone-700">使いみち：{item.use}</p>
                {item.priceTaxIn !== undefined && (
                  <p className="text-sm font-bold text-orange-700">
                    税込 {yen(item.priceTaxIn)}
                    {item.price !== undefined && (
                      <span className="font-normal text-stone-500">（本体 {yen(item.price)}）</span>
                    )}
                  </p>
                )}
              </div>
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}
