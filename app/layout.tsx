import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "手羽屋 営業後日報",
  description: "骨なし手羽先催事販売の日報入力",
  // iPhone でホーム画面に追加したときの名前（アイコンは app/apple-icon.png）。
  // ★ appleWebApp は使わない：使うと「全画面のアプリ」として開くようになり、
  //   iPhone では Safari と控え（どのお店か・合言葉の印）が別になって、入り直しが要る。
  other: { "apple-mobile-web-app-title": "手羽屋" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#d97706",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-stone-50 text-stone-900 min-h-screen">{children}</body>
    </html>
  );
}
