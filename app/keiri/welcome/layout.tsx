import type { Metadata } from "next";

import { keiriContactMailto } from "@/lib/keiri/apply";
import { KEIRI_COMPANY } from "@/lib/keiri/legal";

/**
 * 初回設定（/keiri/welcome）の肩書きだけを決める外枠。
 *
 * 申し込んだお店にいちばん最初に送る URL がここ。
 * 貼ったときに「経理パッケージ」とだけ出るより、
 * 「初回設定」と出たほうが、何をする画面か一目で分かるため。
 *
 * 検索から来る場所ではない（robots.ts で読みに来ないようにしてある）。
 *
 * ★ここに逃げ道を1つ置いている理由（2026-09-25・kp180）
 *   この画面の中身は、すべて「画面で動く側（JavaScript）」で描いている。
 *   そのため最初に配られる中身は「読み込み中…」の1行だけで、
 *   JavaScript が動かない・止められている端末では**その1行のまま終わる**。
 *   ここは**お金を払ったお店がいちばん最初に開く画面**なので、
 *   そこで詰まると「払ったのに何も起きない」になり、連絡する先も画面に無い。
 *   お申し込みの画面（/keiri/apply）には同じ逃げ道が先に置いてあったので、
 *   より大事なこちらにも同じ形で置いた。
 *   <noscript> の中身は、JavaScript が動く端末には**1ピクセルも出ない**ので、
 *   ふだんの見た目は1文字も変わらない。
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
  // 払ったあとの窓口なので "support"（写し付きの下書きが開く／kp72・kp112）
  const mail = keiriContactMailto({ to: KEIRI_COMPANY.email, kind: "support" });

  return (
    <>
      <noscript>
        <div className="mx-auto mb-5 max-w-md rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-stone-800">
          <p className="font-bold">このブラウザでは初回設定の画面をお使いいただけません。</p>
          <p className="mt-2">
            お手数ですが{" "}
            <a href={mail.url} className="font-bold underline">
              {KEIRI_COMPANY.email}
            </a>{" "}
            まで、お店の名前とこのページのリンクをお送りください。こちらで初回設定を行い、
            管理画面に入るための合言葉をお返しします。
          </p>
          <p className="mt-2">
            お急ぎのときは{" "}
            <a href={`tel:${KEIRI_COMPANY.tel.replace(/-/g, "")}`} className="font-bold underline">
              {KEIRI_COMPANY.tel}
            </a>{" "}
            までお電話ください。
          </p>
        </div>
      </noscript>
      {children}
    </>
  );
}
