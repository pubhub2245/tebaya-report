"use client";

import Link from "next/link";
import ProductMaster from "@/app/components/ProductMaster";
import StaffMaster from "@/app/components/StaffMaster";
import LocationMaster from "@/app/components/LocationMaster";

/**
 * 従業員も使える登録ページ（管理者パスワード不要）。
 * 商品（もも焼き等）・担当者・出店場所を、現場の人が自分で追加・編集できる。
 * 管理者専用版は /admin/settings（同じ部品を使用）。
 */
export default function PublicSettingsPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">
          ⚙️ 商品・担当・場所の登録
        </h1>
        <Link href="/" className="btn-secondary text-sm">
          🏠 トップ
        </Link>
      </header>

      <div className="card bg-blue-50 border border-blue-200 text-sm text-blue-900 space-y-1">
        <p className="font-bold">ここは誰でも編集できます。</p>
        <p className="text-xs leading-relaxed">
          お店の商品（例：もも屋の「もも焼き」）・担当者・出店場所を、自分で追加・編集できます。
          変更はすぐアプリに反映されます。日報で「商品が登録されていません」と出たときは、
          ここで商品を登録してから、日報の画面を開き直してください。
        </p>
      </div>

      <ProductMaster />
      <hr className="border-stone-200" />
      <StaffMaster />
      <hr className="border-stone-200" />
      <LocationMaster />

      <p className="text-[11px] text-stone-400 leading-relaxed">
        ※ 商品の「単価」は、日報の売上チェックに使われます。正しい金額を入れてください。
        入力に迷ったら管理者（じゅんさん）に確認してください。
      </p>
    </main>
  );
}
