import Link from "next/link";
import MonthlySummary from "./components/MonthlySummary";

export default function MenuPage() {
  return (
    <main className="max-w-md mx-auto px-4 py-8 min-h-screen flex flex-col">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-brand-dark">
          手羽屋 業務システム
        </h1>
      </header>

      <section className="mb-6">
        <MonthlySummary />
      </section>

      <section className="space-y-4 flex-1">
        <Link
          href="/report"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">📋</span>
          <span>営業後日報</span>
        </Link>
        <Link
          href="/interim"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">📊</span>
          <span>中間報告</span>
        </Link>
      </section>

      <footer className="mt-8 text-center">
        <Link
          href="/admin"
          className="text-sm text-stone-500 underline hover:text-stone-700"
        >
          管理者ページ →
        </Link>
      </footer>
    </main>
  );
}
