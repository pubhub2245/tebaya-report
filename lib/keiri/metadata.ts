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
 * ■ 写真は付けない
 *   出せる写真（店の中・画面の写真）をまだ持っていないため。
 *   無い写真を作ると事実でないものを出すことになるので、文字だけのカードにする。
 *   写真が用意できたら、ここ1か所に image を足せば全ページに効く。
 */
export const KEIRI_SITE_NAME = "経理パッケージ";

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
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
