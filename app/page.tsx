import Link from "next/link";
import MonthlySummary from "./components/MonthlySummary";
import LocationRankingSummary from "./components/LocationRankingSummary";

/** グループ見出し */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-stone-400 px-1 mb-2">{children}</p>
  );
}

/** 2列グリッド用の中サイズボタン（アイコン上・ラベル下） */
function TileLink({
  href,
  emoji,
  label,
  color,
}: {
  href: string;
  emoji: string;
  label: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1 h-24 rounded-2xl text-white font-bold shadow-md transition ${color}`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-sm text-center leading-tight px-1">{label}</span>
    </Link>
  );
}

export default function MenuPage() {
  return (
    <main className="max-w-md mx-auto px-4 py-8 min-h-screen flex flex-col">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-brand-dark">
          手羽屋 業務システム
        </h1>
      </header>

      <section className="mb-5">
        <MonthlySummary />
      </section>

      {/* よく使う報告 */}
      <section className="mb-5">
        <GroupLabel>📝 日々の報告</GroupLabel>
        <Link
          href="/report"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-xl shadow-md transition mb-3"
        >
          <span className="text-2xl">📋</span>
          <span>営業後日報</span>
        </Link>
        <div className="grid grid-cols-3 gap-3">
          <TileLink
            href="/setup-check"
            emoji="🪙"
            label="設営後チェック"
            color="bg-amber-500 hover:bg-amber-600 active:bg-amber-700"
          />
          <TileLink
            href="/interim"
            emoji="📊"
            label="中間報告"
            color="bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
          />
          <TileLink
            href="/prep"
            emoji="🍳"
            label="仕込み日報"
            color="bg-rose-500 hover:bg-rose-600 active:bg-rose-700"
          />
        </div>
      </section>

      {/* シフト・出店 */}
      <section className="mb-5">
        <GroupLabel>📅 シフト・出店</GroupLabel>
        <Link
          href="/shifts"
          className="flex items-center justify-center gap-3 w-full h-16 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-lg shadow-md transition"
        >
          <span className="text-2xl">📅</span>
          <span>シフト・出店先問い合わせ</span>
        </Link>
      </section>

      {/* みんなの声 */}
      <section className="mb-5">
        <GroupLabel>🗣️ みんなの声</GroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <TileLink
            href="/feedback"
            emoji="💡"
            label="意見箱"
            color="bg-pink-500 hover:bg-pink-600 active:bg-pink-700"
          />
          <TileLink
            href="/agenda"
            emoji="🗣️"
            label="ミーティング議題"
            color="bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800"
          />
        </div>
      </section>

      <section className="mb-4">
        <LocationRankingSummary />
      </section>

      <footer className="mt-auto pt-4 text-center space-y-2">
        <Link
          href="/cash"
          className="block text-sm text-stone-500 underline hover:text-stone-700"
        >
          💰 現金残高（管理者） →
        </Link>
        <Link
          href="/sales-report"
          className="block text-sm text-stone-500 underline hover:text-stone-700"
        >
          💹 売上報告（管理者） →
        </Link>
        <Link
          href="/admin"
          className="block text-sm text-stone-500 underline hover:text-stone-700"
        >
          管理者ページ →
        </Link>
      </footer>
    </main>
  );
}
