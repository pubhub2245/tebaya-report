"use client";

/**
 * 「まだ お店ごとに分けられていない画面」を、手羽屋以外には開かないようにする門。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   経理パッケージを申し込んだお店のスタッフも、このアプリの画面をそのまま開けます
 *   （合言葉が要るのは管理者ページだけです）。
 *   日報・出店場所・担当者・商品・経理の数字は「どの店のものか」の印で絞ってあるので、
 *   よそのお店には手羽屋のものが出ません。
 *   ところが **出店予定（shifts）** と **現場の立替（keiri_advance_expenses）** の
 *   2つの棚だけは、その印の欄がまだありません（→ lib/tenantScope.ts）。
 *   絞りようが無いので、そのままだと
 *   ・申し込んだお店のスタッフに、**手羽屋の出店予定と立替が見える**
 *   ・申し込んだお店が入れた予定・立替が、**手羽屋の画面に混ざる**
 *   の両方が起きます。
 *
 * ■ この門がやること
 *   いま開いているのが手羽屋なら、**今までどおり中身をそのまま出します**。
 *   よそのお店なら、中身を出さずに「まだご利用いただけません」とだけ伝えます。
 *   読ませないのと同時に書かせないので、混ざる道を両方ふさげます。
 *
 * ■ 手羽屋への影響：ありません
 *   手羽屋は印が空（null）なので、必ず中身が出ます。
 *   ブラウザの控えを読むのは画面が出たあとなので、
 *   読む前のひと呼吸だけ「読み込み中…」と出ます（そのあとは今までと同じ画面です）。
 *
 * ★ 棚に印の欄を足したら（Supabase で1列足すだけ）、この門を外して
 *   ふつうに applyTenantScope で絞る形に直してください。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TEBAYA_SCOPE,
  isTebayaScope,
  readTenantScope,
  type TenantScope,
} from "@/lib/tenantScope";


/**
 * 「いま手羽屋として開いているか」を、画面の部品から使うための小さな道具。
 *
 * 返すのは2つ：
 *   checking … ブラウザの控えをまだ読んでいない（＝まだ決められない）
 *   isTebaya … 手羽屋なら true。よそのお店なら false
 *
 * ページ全体ではなく「1つの枠だけ出さない」ときに使う
 * （例：トップの月間売上まとめ。出店予定の目標額から作っているので、
 *  よそのお店では出しようがなく、出すと手羽屋の数字になってしまう）。
 */
export function useIsTebaya(): { checking: boolean; isTebaya: boolean } {
  const [checking, setChecking] = useState(true);
  const [tebaya, setTebaya] = useState(true);
  useEffect(() => {
    setTebaya(isTebayaScope(readTenantScope()));
    setChecking(false);
  }, []);
  return { checking, isTebaya: tebaya };
}

export default function TebayaOnlyGate({
  /** 画面の名前（「出店予定」「立替経費」など。お知らせの文に出ます） */
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  /** ブラウザの控えをまだ読んでいないあいだは true */
  const [checking, setChecking] = useState(true);
  const [scope, setScope] = useState<TenantScope>(TEBAYA_SCOPE);

  useEffect(() => {
    setScope(readTenantScope());
    setChecking(false);
  }, []);

  if (checking) {
    return (
      <main className="max-w-md mx-auto px-4 py-5">
        <p className="text-sm text-stone-500">読み込み中…</p>
      </main>
    );
  }

  // 手羽屋（印が空）は今までどおり
  if (isTebayaScope(scope)) return <>{children}</>;

  return (
    <main className="max-w-md mx-auto px-4 py-5 pb-10 space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-brand-dark">{title}</h1>
        <Link href="/" className="btn-secondary text-sm">
          🏠 トップ
        </Link>
      </header>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
        <div className="text-sm font-bold text-amber-900">
          この画面は、まだご利用いただけません
        </div>
        <p className="text-sm text-amber-900 leading-relaxed">
          「{title}」は、いまお店ごとに分けている途中です。
          分け終わるまでは開かないようにしています。
          <br />
          <b>ほかのお店の予定や金額が、お客さまの画面に出ることはありません。</b>
        </p>
        <p className="text-xs text-amber-700 leading-relaxed">
          日報・経理の画面は、今までどおりお使いいただけます。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Link href="/report" className="btn-primary text-center">
          📝 営業後日報へ
        </Link>
        <Link href="/keiri" className="btn-secondary text-center">
          📊 経理の画面へ
        </Link>
      </div>
    </main>
  );
}
