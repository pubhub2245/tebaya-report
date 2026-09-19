import type { Metadata } from "next";

import VisitBeacon from "@/components/VisitBeacon";
import { BUILD_STAMP } from "@/lib/buildStamp";
import { KEIRI_PUBLIC_PAGES } from "@/app/keiri/components/nav";
import { PUBLIC_SITE_URL } from "@/lib/keiri/siteUrl";

/**
 * 経理パッケージの共通の外枠。
 *
 * 見た目は今までと1つも変えていない（children をそのまま出すだけ）。
 * 足したのは「このページが開かれた」と数えるための合図だけ。
 *
 * ★数えるのは**外向きの10ページだけ**。
 *   経理の画面（/keiri）・初回設定（/keiri/welcome）・立替の入力（/keiri/advances）は
 *   お店の人が使う画面なので、「サイトに来た人」には数えない。
 */
const PUBLIC_PATHS = KEIRI_PUBLIC_PAGES.map((p) => p.path);

/**
 * 経理パッケージの既定の肩書き。
 *
 * これが無いと、経理パッケージのどのページを LINE やメールに貼っても
 * サイト全体の題名「手羽屋 営業後日報」が出てしまう（手羽屋の日報アプリと
 * 同じ入れ物の中にあるため）。紹介の URL を送る相手には意味の分からない題名なので、
 * ここで経理パッケージの題名に上書きする。
 * 外向きの10ページは、それぞれのページ側でさらに自分の題名に上書きしている。
 */
export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  title: "経理パッケージ",
  description:
    "小さな飲食店・移動販売・催事出店のための経理アプリ。日報を書くだけで、月の利益と今の現金が分かります。",
  /**
   * 見えない札（この版がいつ組み立てられたか）。
   *
   * 画面には何も出ない。/api/version が返す合言葉と見比べると、
   * 「いま配られているページが最新かどうか」が1回で分かる。
   * 2026-09-19 に「出したのに古いままに見える」という誤報が3回出て、
   * そのたびに売る手が止まったので、目で数えない確かめ方を用意した。
   * 入るのはコミットの短い番号と組み立て時刻だけで、秘密の値は入らない。
   */
  other: { "x-build": BUILD_STAMP },
};

export default function KeiriLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <VisitBeacon site="keiri" only={PUBLIC_PATHS} />
    </>
  );
}
