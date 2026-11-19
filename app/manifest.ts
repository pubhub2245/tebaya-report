import type { MetadataRoute } from "next";

/**
 * ホーム画面に追加したときの名前とアイコン（2026-11-19 追加）。
 * アイコンは手羽屋のロゴ（「骨なし手羽先」つき・黒地）から作った。元は tebaya-site の assets/logo-full.webp。
 * display は "browser" のまま（開き方は今までと同じ。アプリのように全画面にはしない）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "手羽屋",
    short_name: "手羽屋",
    start_url: "/",
    display: "browser",
    background_color: "#050303",
    theme_color: "#d97706",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
