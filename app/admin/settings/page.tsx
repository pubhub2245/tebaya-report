"use client";

import Link from "next/link";
import AdminGate from "@/app/components/AdminGate";
import ProductMaster from "@/app/components/ProductMaster";
import StaffMaster from "@/app/components/StaffMaster";
import LocationMaster from "@/app/components/LocationMaster";

export default function SettingsPage() {
  return (
    <AdminGate>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-brand-dark">⚙️ 設定センター</h1>
          <div className="flex gap-2">
            <Link href="/admin" className="btn-secondary text-sm">
              管理者ページ
            </Link>
            <Link href="/" className="btn-secondary text-sm">
              🏠 トップ
            </Link>
          </div>
        </header>

        <p className="text-sm text-stone-600">
          お店・商品・担当者・出店場所を、ここから自分で追加・編集できます。
          変更はすぐアプリに反映されます（コード修正は不要です）。
        </p>

        <ProductMaster />
        <hr className="border-stone-200" />
        <StaffMaster />
        <hr className="border-stone-200" />
        <LocationMaster />
      </main>
    </AdminGate>
  );
}
