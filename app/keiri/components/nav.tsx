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
 * ※ここに載せるのは「この下書きに入っているページ」だけ。
 *   別の下書きにあるページ（/keiri/help など）は、そちらが本番に入ってから足す
 *   （まだ無いページへのリンクを置かない）。
 */
export const KEIRI_PUBLIC_PAGES: { path: string; title: string; lead: string }[] = [
  {
    path: "/keiri/case",
    title: "経理パッケージ（事例と価格）",
    lead: "日報を書くだけで、月の利益と今の現金が分かる。実際に使っている店の数字と価格。",
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
