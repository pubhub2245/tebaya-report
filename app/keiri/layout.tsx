import VisitBeacon from "@/components/VisitBeacon";
import { KEIRI_PUBLIC_PAGES } from "@/app/keiri/components/nav";

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
