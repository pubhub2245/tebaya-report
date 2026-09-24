import type { Metadata } from "next";

import { PUBLIC_SITE_URL } from "@/lib/keiri/siteUrl";

/**
 * 経理パッケージの外向きページの「肩書き」をまとめて作る場所。
 *
 * ■ なぜ要るのか
 *   URL を LINE やメールに貼ると、相手の画面には小さなカード（題名＋説明）が出る。
 *   このカードは og:title / og:description という印から作られる。
 *   印が無いページを貼ると、カードが出ないか、サイト全体の題名
 *   （＝「手羽屋 営業後日報」）がそのまま出てしまう。
 *   知り合いのお店に紹介の URL を送るのに、これでは開いてもらえない。
 *
 * ■ 何を足すか（3つだけ）
 *   ① canonical … 「このページの正式なアドレスはこれ」と検索エンジンに伝える
 *   ② openGraph … LINE・Facebook などが読むカードの中身
 *   ③ twitter   … X が読むカードの中身
 *   題名と説明はページが持っているものをそのまま使う。新しい文言は作らない。
 *
 * ■ 絵（og:image）
 *   LINE に貼ると、絵が無いページは**小さな白い箱**になり、あるページは横長のカードになる。
 *   知り合いから回ってきた1通を開いてもらえるかがここで変わるので、絵を1枚だけ持つ。
 *   中身は案内ページに**すでに書いてある言い方だけ**（新しい約束も値段も書かない）。
 *   絵は倉庫の中で作った PNG（public/keiri/ogp.png）で、外のサービスは使っていない。
 *   作り直し方は tools/ogp/make.mjs。ふだんのビルドでは作らない（＝ビルドが絵で失敗しない）。
 */
export const KEIRI_SITE_NAME = "経理パッケージ";

/** リンクを貼ったときに出る絵。1200×630。全ページ共通の1枚。 */
export const KEIRI_OGP_IMAGE = {
  url: "/keiri/ogp.png",
  width: 1200,
  height: 630,
  alt: "経理パッケージ｜日報を書くだけで、月の利益と今の現金が分かる。",
} as const;

export function keiriMetadata(args: {
  /** そのページのアドレス。例: "/keiri/case" */
  path: string;
  title: string;
  description: string;
  /** 紹介ページ（入口）だけ "website"。読みもの系は "article" */
  type?: "website" | "article";
}): Metadata {
  const { path, title, description, type = "article" } = args;
  const url = `${PUBLIC_SITE_URL}${path}`;
  return {
    metadataBase: new URL(PUBLIC_SITE_URL),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      siteName: KEIRI_SITE_NAME,
      locale: "ja_JP",
      title,
      description,
      images: [{ ...KEIRI_OGP_IMAGE }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [KEIRI_OGP_IMAGE.url],
    },
  };
}
