import Link from "next/link";
import MonthlySummary from "./components/MonthlySummary";
import TaskSummary from "./components/TaskSummary";

export default function MenuPage() {
  return (
    <main className="max-w-md mx-auto px-4 py-8 min-h-screen flex flex-col">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-brand-dark">
          手羽屋 業務システム
        </h1>
      </header>

      <section className="mb-4">
        <MonthlySummary />
      </section>

      <section className="mb-6">
        <TaskSummary />
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
          href="/setup-check"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">🪙</span>
          <span>設営後チェック</span>
        </Link>
        <Link
          href="/prep"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">🍳</span>
          <span>仕込み日報</span>
        </Link>
        <Link
          href="/interim"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">📊</span>
          <span>中間報告</span>
        </Link>
        <Link
          href="/tasks"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">✅</span>
          <span>タスク管理</span>
        </Link>
        <Link
          href="/shifts"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">📅</span>
          <span>自分のシフトを確認</span>
        </Link>
        <Link
          href="/stats"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">📊</span>
          <span>チーム成績を見る</span>
        </Link>
        <Link
          href="/feedback"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">💡</span>
          <span>意見箱</span>
        </Link>
        <Link
          href="/business-hours"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">🕐</span>
          <span>営業時間</span>
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
