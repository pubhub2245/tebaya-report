import Link from "next/link";
import MonthlySummary from "./components/MonthlySummary";
import LocationRankingSummary from "./components/LocationRankingSummary";
import { NotTebayaBlock, TebayaOnlyBlock } from "./components/TebayaOnlyGate";
import AppTitle from "./components/AppTitle";
import OwnerOutreachNudge from "./components/OwnerOutreachNudge";
import OwnerApplicationAlert from "./components/OwnerApplicationAlert";
import OwnerSetupTodoNotice from "./components/OwnerSetupTodoNotice";
import OwnerAdminLink from "./components/OwnerAdminLink";
import FranchiseMonthCard from "./components/FranchiseMonthCard";

/** グループ見出し */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-stone-400 px-1 mb-2">{children}</p>
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

      {/* ─── 手羽屋（2026-11-09 じゅん決定）───
          「ページはできるだけシンプルに・ボタンは大きく・機能は減らすほどいい」。
          現場が押すのは「写真で日報を出す」だけ。あとは過去の日報を見る1つ。
          月の進捗・ランキング・イベント段取り・設定はじゅんの道具なので管理者ページ（/admin）にまとめた。
          中間報告・設営後チェック・シフト・出店先の問い合わせ・意見箱・議題・現金残高・売上報告・
          レジ突き合わせ・経理パッケージのご案内の入り口は置かない（画面とデータは残してある）。 */}
      <TebayaOnlyBlock>
        <section className="flex-1 flex flex-col justify-center gap-5 py-6">
          <Link
            href="/report/photo"
            className="flex flex-col items-center justify-center gap-2 w-full h-48 rounded-3xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold shadow-lg transition"
          >
            <span className="text-6xl">📷</span>
            <span className="text-3xl">写真で日報を出す</span>
          </Link>
          <Link
            href="/report/edit"
            className="flex items-center justify-center gap-3 w-full h-20 rounded-3xl bg-white border-2 border-stone-200 active:border-orange-500 text-stone-700 font-bold text-xl shadow-sm transition"
          >
            <span className="text-2xl">📖</span>
            <span>過去の日報を見る</span>
          </Link>
          {/* 今月の数字（売上・経費・残り）の小さいカード（2026-11-09）。手羽屋のときだけ */}
          <FranchiseMonthCard />
        </section>
      </TebayaOnlyBlock>

      {/* ─── 経理パッケージのお店：これまでどおり ─── */}
      <NotTebayaBlock>
        <section className="mb-5">
          <MonthlySummary />
        </section>
        <section className="mb-5">
          <GroupLabel>📝 日報</GroupLabel>
          <Link
            href="/report"
            className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-xl shadow-md transition"
          >
            <span className="text-2xl">📋</span>
            <span>営業後日報</span>
          </Link>
          <Link
            href="/report/edit"
            className="block text-center text-sm text-stone-500 underline hover:text-stone-700 mt-3"
          >
            ✏️ 過去の日報を見る・直す →
          </Link>
          <Link
            href="/settings"
            className="block text-center text-sm text-stone-500 underline hover:text-stone-700 mt-2"
          >
            ⚙️ 商品・担当・場所を登録する →
          </Link>
        </section>
        <section className="mb-4">
          <LocationRankingSummary />
        </section>
      </NotTebayaBlock>

      {/* 下の小さいリンクは管理者ページだけ。手羽屋ではじゅんの端末にしか出ない（2026-11-09）。
          経理パッケージのご案内・現金残高・売上報告・レジ突き合わせは「ごちゃつく原因」なので置かない。 */}
      <footer className="mt-auto pt-4 text-center space-y-2">
        <TebayaOnlyBlock>
          <OwnerAdminLink />
        </TebayaOnlyBlock>
        <NotTebayaBlock>
          <Link
            href="/admin"
            className="block text-sm text-stone-400 underline hover:text-stone-700"
          >
            管理者ページ →
          </Link>
        </NotTebayaBlock>
      </footer>
    </main>
  );
}
