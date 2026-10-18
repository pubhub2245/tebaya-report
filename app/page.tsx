import Link from "next/link";
import MonthlySummary from "./components/MonthlySummary";
import LocationRankingSummary from "./components/LocationRankingSummary";
import { TebayaOnlyBlock } from "./components/TebayaOnlyGate";
import AppTitle from "./components/AppTitle";
import OwnerOutreachNudge from "./components/OwnerOutreachNudge";
import OwnerApplicationAlert from "./components/OwnerApplicationAlert";
import OwnerSetupTodoNotice from "./components/OwnerSetupTodoNotice";
import KeiriCaseLink from "./components/KeiriCaseLink";

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
        <AppTitle />
      </header>

      {/* じゅんだけの一度きりの手続きが のこっていることの知らせ（2026-10-12・f1-4／f3-4／f5-4）。
          のこりは3つ（貼り紙・金庫を数える・鍵の貼り直し）で、仕上げの3項目がこれ待ち。
          一覧は経理の画面（/keiri）に出していたが、じゅんが毎日ひらくのはここなので、
          同じ答えをここにも出す。赤い知らせとまったく同じ印を使う＝スタッフには出ない。
          出すのは「のこり何件・何分・どの1枚をひらくか」だけで、鍵・金額・お店の名前は出さない。
          日報のデータは1行も読み書きしない。 */}
      <OwnerSetupTodoNotice />

      {/* お申し込みが入ったのに誰も気づかない、を防ぐ赤い知らせ（kp156）。
          知らせる道はスタッフのLINEしかなく、今月あと5通しか残っていない。
          帯とまったく同じ印を使う＝スタッフには出ない。出すのは件数と時刻だけで、
          お店の名前・ご連絡先は1文字も出さない。日報のデータは1行も読み書きしない。 */}
      <OwnerApplicationAlert />

      {/* 経理パッケージの「今日1軒だけ送る」の帯（kp145）。
          管理者パスワードを入れたことがある端末にだけ出る＝スタッフには出ない。
          日報のデータは1行も読み書きしない。 */}
      <OwnerOutreachNudge />

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
        {/* 設営後チェックと中間報告は、まだ お店ごとに分かれていない棚を読むので
            手羽屋にだけ出す。押しても開けないボタンを見せないため（→ TebayaOnlyGate）。 */}
        <TebayaOnlyBlock>
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
        </TebayaOnlyBlock>
        {/* 自分のお金で立て替えたときだけ使う入り口。
            レジのお金から払った経費は日報のSTEP5に入れる。 */}
        <TebayaOnlyBlock>
          <Link
            href="/keiri/advances"
            className="flex items-center justify-center gap-2 w-full h-14 mt-3 rounded-2xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold shadow-md transition"
          >
            <span className="text-xl">🧾</span>
            <span className="text-sm leading-tight text-center">
              立替経費（自分のお金で払ったとき）
            </span>
          </Link>
        </TebayaOnlyBlock>
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
        <Link
          href="/business-hours"
          className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xl shadow-md transition"
        >
          <span className="text-2xl">🕐</span>
          <span>営業時間</span>
        </Link>
      </section>

      {/* シフト・出店。出店予定（shifts）にはまだ「どの店か」の印の欄が無いので、
          手羽屋にだけ出す（→ lib/tenantScope.ts）。 */}
      <TebayaOnlyBlock>
        <section className="mb-5">
          <GroupLabel>📅 シフト・出店</GroupLabel>
          <Link
            href="/shifts"
            className="flex items-center justify-center gap-3 w-full h-16 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-lg shadow-md transition"
          >
            <span className="text-2xl">📅</span>
            <span>シフト・出店先問い合わせ</span>
          </Link>
          {/* イベント・お祭りの段取り（2026-10-18）。発注本数・骨抜き担当・フライヤー・電源を
              1枚にまとめ、LINEに貼る文をコピーできる（→ lib/eventPlan.ts）。 */}
          <Link
            href="/events"
            className="flex items-center justify-center gap-3 w-full h-14 mt-3 rounded-2xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold shadow-md transition"
          >
            <span className="text-xl">🎪</span>
            <span>イベント段取り</span>
          </Link>
        </section>
      </TebayaOnlyBlock>

      {/* みんなの声 …… 意見箱とミーティング議題は、まだ お店ごとに分かれていない棚を
          読むので、経理パッケージを申し込んだお店には出しません（→ lib/tenantScope.ts）。
          手羽屋は印が空なので、これまでどおり出ます。 */}
      <TebayaOnlyBlock>
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
      </TebayaOnlyBlock>

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
        {/* 経理パッケージのご案内へ行く道（kp200）。外向け・誰でも見られる。
            これまではただの「紹介ページ →」で、①合言葉が付かず②読むところに着くだけ
            でした。合言葉 app 付きで入力欄まで行く形にそろえ、出店先で見せる1枚への
            道も隣に置く。店の中のデータは読まない。 */}
        <KeiriCaseLink />
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
