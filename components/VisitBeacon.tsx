"use client";

import { useEffect } from "react";

/**
 * 「このページが開かれた」ことを1回だけ知らせる小さな部品。
 *
 * ■ 何をするか
 *   ページが表示されたら、数える受け口（/api/hit）へ合図を1回送るだけ。
 *   画面には何も出さない。表示にも速度にも影響しない（読み込みが終わってから送る）。
 *
 * ■ 送らないもの
 *   IPアドレス・ブラウザの種類・お客さんを見分ける印は送らない。
 *   送るのは「サイト名・ページの場所・合言葉（utm_campaign）・来た元のドメイン」だけ。
 *
 * ■ 失敗しても何も起きない
 *   受け口が落ちていても、ページの表示はまったく変わらない。
 */

/** 数える受け口。ほかのサイトからもここ1か所に集める */
export const HIT_ENDPOINT = "https://tebaya-report.vercel.app/api/hit";

export default function VisitBeacon({
  site,
  only,
}: {
  /** playmiyazaki / ai-tools-navi / endo / mh-build-roadmap / keiri */
  site: string;
  /** この場所（パス）のときだけ数える。省略すると全部数える */
  only?: string[];
}) {
  useEffect(() => {
    try {
      const path = window.location.pathname;
      if (only && !only.includes(path)) return;

      const campaign = new URLSearchParams(window.location.search).get(
        "utm_campaign",
      );

      const body = JSON.stringify({
        site,
        path,
        campaign,
        ref: document.referrer || null,
      });

      // 画面の表示が終わってから送る（表示を遅らせない）
      const send = () => {
        fetch(HIT_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
          // 数えるだけなので、返事も入れ物（cookie）も要らない
          credentials: "omit",
          mode: "cors",
        }).catch(() => {
          /* 数えられなくても、ページには何の影響も無い */
        });
      };

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(send, { timeout: 3000 });
      } else {
        window.setTimeout(send, 1200);
      }
    } catch {
      /* 何があってもページを壊さない */
    }
    // 1ページにつき1回だけ
  }, [site, only]);

  return null;
}
