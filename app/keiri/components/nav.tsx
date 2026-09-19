import Link from "next/link";

/**
 * 経理パッケージの「外向きページ」だけで使う部品。
 * 手羽屋の業務画面（日報・シフト・レジ）には一切関係しない。
 *
 * ★ページの一覧はここ1か所だけに書く。増やすときはここに足す
 *   （画面ごとにリンクを書くと、消したページへのリンクが残る）。
 */

/**
 * 検索エンジンにも人にも見せる、公開ページの一覧。
 * ※ここに載せるのは「本番に出ているページ」だけ（まだ無いページへのリンクを置かない）。
 * ※申し込んだ店だけが開く /keiri/welcome（初回設定）と、
 *   スタッフが使う /keiri/advances（立替の入力）は、検索から入るページではないので載せない。
 *   /keiri（経理の画面）は管理者だけが見るので載せない。
 */
export const KEIRI_PUBLIC_PAGES: { path: string; title: string; lead: string }[] = [
  {
    path: "/keiri/demo",
    title: "お試し版（申し込まずに触る）",
    lead: "登録も申し込みも要らずに、本物の経理画面をそのまま触れます。日報を1件書くと3つの数字がその場で変わります。",
  },
  {
    path: "/keiri/tools",
    title: "飲食店の無料計算ツール",
    lead: "登録不要でその場で使える計算の道具。赤字ラインと原価率・FL比率。",
  },
  {
    path: "/keiri/tools/bunki-ten",
    title: "赤字ラインの計算（損益分岐点）",
    lead: "家賃と原価率を入れると、月にいくら売ればトントンか、1日あたり何円・何人必要かが出ます。",
  },
  {
    path: "/keiri/tools/genka-ritsu",
    title: "原価率・FL比率の計算",
    lead: "1か月の売上・仕入・人件費から、原価率と人件費率、引いたあとに残る額を出します。",
  },
  {
    path: "/keiri/case",
    title: "経理パッケージ（事例と価格）",
    lead: "日報を書くだけで、月の利益と今の現金が分かる。実際に使っている店の数字と価格。",
  },
  {
    path: "/keiri/apply",
    title: "お申し込み",
    lead: "お店の名前・お名前・メールアドレスをいただければ、担当からご案内します。この画面でお支払いは発生しません。",
  },
  {
    path: "/keiri/excel",
    title: "エクセルの売上管理をやめたい",
    lead: "エクセルの何がつらいのか、日報に置き換えると何が変わるのかを並べました。",
  },
  {
    path: "/keiri/kaikei-soft",
    title: "会計ソフトとの違い",
    lead: "会計ソフトの代わりではなく、その手前を埋める道具です。どこまでやるかをはっきり書きました。",
  },
  {
    path: "/keiri/howto",
    title: "移動販売の売上・経費の付け方",
    lead: "出店ごとに場所も売上も変わるお店が、その日のうちに数字を締める手順。",
  },
  {
    path: "/keiri/kakutei-shinkoku",
    title: "確定申告の準備",
    lead: "屋台・移動販売が、申告のときに渡す材料を毎日そろえておくための話。税務の判断はしません。",
  },
  {
    path: "/keiri/kicho",
    title: "記帳はどこまでやるか",
    lead: "毎日やること・月末にやること・年に1回でいいことを分けました。毎日ぶんは日報1枚です。",
  },
  {
    path: "/keiri/receipt",
    title: "レシートの残し方",
    lead: "品物の値段だけを拾うと消費税がまるごと落ちます。税込のまま経費にする手順。",
  },
  {
    path: "/keiri/genkin",
    title: "レジのお金が合わない",
    lead: "現金商売で手元の現金が合わなくなる原因と、ズレた日をその翌朝に見つける方法。",
  },
  {
    path: "/keiri/hajimekata",
    title: "何から手を付けるか",
    lead: "始めの3日でここまで作っておけば、あとは毎日の日報だけで数字が貯まります。",
  },
  {
    path: "/keiri/help",
    title: "困ったとき（よくある質問）",
    lead: "毎日やること・レシートの税込・立替の入れ方・利益と現金の違い・解約のしかたを1ページに。",
  },
  {
    path: "/keiri/legal",
    title: "特定商取引法に基づく表記・会社概要",
    lead: "だれが売っているか、価格・支払い・解約・返金の条件。法律で表示が必要な項目をまとめています。",
  },
];

/** パンくず（いまどこにいるか）。先頭の「経理パッケージ」は常に付く */
export function KeiriBreadcrumb({ items }: { items: { name: string; href?: string }[] }) {
  const all = items[0]?.name === "経理パッケージ" ? items : [{ name: "経理パッケージ", href: "/keiri/case" }, ...items];
  return (
    <nav aria-label="現在の場所" className="mb-6 text-xs text-stone-500">
      {all.map((it, i) => (
        <span key={`${it.name}-${i}`}>
          {i > 0 && <span aria-hidden="true"> ／ </span>}
          {it.href ? (
            <Link href={it.href} className="underline hover:text-stone-700">
              {it.name}
            </Link>
          ) : (
            <span aria-current="page">{it.name}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** 関連ページ（いま開いているページは出さない） */
export function KeiriRelated({ current }: { current: string }) {
  const others = KEIRI_PUBLIC_PAGES.filter((p) => p.path !== current);
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-stone-900">ほかのページ</h2>
      <ul className="mt-4 space-y-3">
        {others.map((p) => (
          <li key={p.path}>
            <Link
              href={p.path}
              className="block rounded-xl bg-white border border-stone-200 p-4 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">{p.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{p.lead}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 外向きページの共通フッター。
 * ★特定商取引法に基づく表記へのリンクは、売っているページの全部から辿れる必要がある。
 *   ここ1か所に置くことで、ページを足したときのリンク漏れを防ぐ。
 *
 * ★手羽屋の業務システムへの戻り道は置かない（2026-09-19・kp72。戻さないこと）。
 *   以前は /keiri/case と /keiri/apply だけにこのリンクが出ていた。
 *   ＝**外のお店に送る2ページだけ**が、手羽屋の業務システムの入口を出していた。
 *   送り先は同じ催事に出ている同業のお店なので、
 *   売り込みのページから他店の業務システムへ1押しで入れる形は置かない。
 *   （日報などの棚は、いまブラウザからも読める決まりのまま。CLAUDE.md 4-8）
 *   手羽屋の人は業務システムの側から /keiri に入るので、この戻り道は要らない。
 */
export function KeiriFooter() {
  return (
    <footer className="text-center text-xs text-stone-400">
      <p>運営：株式会社Alpha</p>
      <p className="mt-1">
        <Link href="/keiri/legal" className="underline hover:text-stone-600">
          特定商取引法に基づく表記・会社概要
        </Link>
      </p>
    </footer>
  );
}
