"use client";

/**
 * トップ画面の題（タイトル）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   経理パッケージを申し込んだお店のスタッフも、このアプリをそのまま開きます。
 *   ところが題がいつも「手羽屋 業務システム」だったので、
 *   **お金を払った方が最初に開く画面に、よそのお店の名前が出ていました**。
 *   日報の画面（/report）はすでにお店の名前に差し替えてあったので、
 *   同じやり方（/api/keiri/shop で名前を引く）をトップにも合わせます。
 *
 * ■ 手羽屋への影響：ありません
 *   手羽屋は印が空なので、これまでどおり「手羽屋 業務システム」と出ます。
 *   名前を引きに行くのも、印があるときだけです。
 */

import { useEffect, useState } from "react";

import { isTebayaScope, readTenantScope } from "@/lib/tenantScope";

/** 手羽屋の題（これまでと同じ文字） */
const TEBAYA_TITLE = "手羽屋 業務システム";
/** 名前がまだ引けていないお店の題 */
const FALLBACK_TITLE = "業務システム";

export default function AppTitle() {
  const [title, setTitle] = useState(TEBAYA_TITLE);

  useEffect(() => {
    const scope = readTenantScope();
    // 手羽屋（印が空）は、これまでと1つも変えない
    if (isTebayaScope(scope) || !scope) return;

    setTitle(FALLBACK_TITLE);
    (async () => {
      try {
        const res = await fetch(`/api/keiri/shop?id=${encodeURIComponent(scope)}`);
        const json = await res.json().catch(() => null);
        if (json?.ok && json.shopName) setTitle(`${String(json.shopName)} 業務システム`);
      } catch {
        // 名前が引けなくても画面は出す（「業務システム」のまま）
      }
    })();
  }, []);

  return <h1 className="text-2xl font-bold text-brand-dark">{title}</h1>;
}
