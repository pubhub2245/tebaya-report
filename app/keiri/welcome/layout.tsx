import type { Metadata } from "next";

/**
 * 初回設定（/keiri/welcome）の肩書きだけを決める外枠。
 *
 * 申し込んだお店にいちばん最初に送る URL がここ。
 * 貼ったときに「経理パッケージ」とだけ出るより、
 * 「初回設定」と出たほうが、何をする画面か一目で分かるため。
 * 見た目・中身は1つも変えていない（children をそのまま出すだけ）。
 *
 * 検索から来る場所ではない（robots.ts で読みに来ないようにしてある）。
 */
export const metadata: Metadata = {
  title: "初回設定｜経理パッケージ",
  description: "経理パッケージを申し込んだお店が、いちばん最初に開く画面です。",
};

export default function KeiriWelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
