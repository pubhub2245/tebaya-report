import Link from "next/link";
import MonthlySummary from "./components/MonthlySummary";
import LocationRankingSummary from "./components/LocationRankingSummary";
import { NotTebayaBlock, TebayaOnlyBlock } from "./components/TebayaOnlyGate";
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

      {/* 日報（2026-11-07 作り変え）。
          現場の入力が大変という声を受け、日報は「写真を撮ってOK」だけにした
          （→ app/report/photo・lib/photoReport.ts）。
          手入力の営業後日報・設営後チェック・中間報告・シフト・意見箱・議題の入り口は外した。
          画面ファイルとデータは残してあるので、戻したいときはここにリンクを足すだけでよい。 */}
      <section className="mb-5">
        <GroupLabel>📝 日報</GroupLabel>
        <TebayaOnlyBlock>
          <Link
            href="/report/photo"
            className="flex items-center justify-center gap-3 w-full h-24 rounded-2xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-2xl shadow-md transition"
          >
            <span className="text-3xl">📷</span>
            <span>写真で日報を出す</span>
          </Link>
        </TebayaOnlyBlock>
        {/* 経理パッケージのお店は、これまでどおり手入力の日報 */}
        <NotTebayaBlock>
          <Link
            href="/report"
            className="flex items-center justify-center gap-3 w-full h-20 rounded-2xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-xl shadow-md transition"
          >
            <span className="text-2xl">📋</span>
            <span>営業後日報</span>
          </Link>
        </NotTebayaBlock>
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

      {/* イベント・お祭りの段取り（2026-10-18）。第3段階でイベント情報ページと一つにする。 */}
      <TebayaOnlyBlock>
        <section className="mb-5">
          <GroupLabel>🎪 イベント</GroupLabel>
          <Link
            href="/events"
            className="flex items-center justify-center gap-3 w-full h-14 rounded-2xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold shadow-md transition"
          >
            <span className="text-xl">🎪</span>
            <span>イベント段取り</span>
          </Link>
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
