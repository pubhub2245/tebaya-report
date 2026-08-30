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
        {/* 仕込み日報（/prep）は 2026-06-09 で運用停止したため入り口を外した。
            画面とデータは残してあるので、再開したいときはここに戻すだけでよい。 */}
        <div className="grid grid-cols-2 gap-3">
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
        </div>
        {/* 自分のお金で立て替えたときだけ使う入り口。
            レジのお金から払った経費は日報のSTEP5に入れる。 */}
        <Link
          href="/keiri/advances"
          className="flex items-center justify-center gap-2 w-full h-14 mt-3 rounded-2xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold shadow-md transition"
        >
          <span className="text-xl">🧾</span>
          <span className="text-sm leading-tight text-center">
            立替経費（自分のお金で払ったとき）
          </span>
        </Link>
        <Link
          href="/report/edit"
          className="block text-center text-sm text-stone-500 underline hover:text-stone-700 mt-3"
        >
          ✏️ 過去の日報を修正する →
        </Link>
        <Link
          href="/settings"
          className="block text-center text-sm text-stone-500 underline hover:text-stone-700 mt-2"
        >
          ⚙️ 商品・担当・場所を登録する →
        </Link>
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
          href="/cash/register"
          className="block text-sm text-stone-500 underline hover:text-stone-700"
        >
          🔍 レジ突き合わせ（管理者） →
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
