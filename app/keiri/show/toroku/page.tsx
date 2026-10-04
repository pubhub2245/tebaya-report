import type { Metadata } from "next";
import Link from "next/link";

import {
  ONSITE_OPEN_LABEL,
  SHOW_APP_TITLE,
  SHOW_BACK_LABEL,
} from "@/lib/keiri/show";

import OnsiteApplyForm from "../OnsiteApplyForm";

/**
 * 「この場で代わりに登録する」だけの1枚（2026-10-02・kp216）。
 *
 * ■ 何のための1枚か
 *   10/7（水）の出店説明会のような立ち話で、**相手がスマホを出されないとき**に、
 *   じゅんがうかがった2つ（お店の名前・電話番号）をその場で打ち込む所です。
 *   見せる1枚（/keiri/show）のいちばん下にも同じ欄がありますが、そちらは
 *   4画面ぶん下へ送って、さらに［この場で代わりに登録する］を開く必要があります。
 *   立ち話の数十秒では、そこで話題が流れます。**開いた瞬間に欄が出ている1枚**を
 *   別に用意して、見せる1枚のいちばん上から1タップで着くようにしました。
 *
 * ■ 決めごと
 *   ・**欄の中身は1行も変えていない。**同じ部品（OnsiteApplyForm）を、
 *     開いた状態で呼んでいるだけです。送り先（/api/keiri/apply）・受け皿・
 *     合言葉（onsite）・値段・約束・特商法の書き方は1文字も変わりません
 *   ・**静かなページのまま**（倉庫を1行も読まない）。電波が細い会場でも出ます
 *   ・検索には出さない（noindex）。sitemap にも載せない
 *   ・文章は lib/keiri/show.ts が唯一の正。ここに直書きしない
 *
 * ■ 手羽屋の機能には1行もさわっていない
 *   日報・シフト・レジ・LINE の送り方・お金の計算（lib/money.ts）は変えていない。
 */

export const metadata: Metadata = {
  title: ONSITE_OPEN_LABEL,
  robots: { index: false, follow: false },
  appleWebApp: { title: SHOW_APP_TITLE },
};

export default function KeiriShowTorokuPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-6">
      <OnsiteApplyForm defaultOpen />

      <Link
        href="/keiri/show"
        className="mt-5 flex min-h-14 w-full items-center justify-center rounded-2xl border border-stone-400 px-5 text-lg font-bold text-stone-900"
      >
        {SHOW_BACK_LABEL}
      </Link>
    </main>
  );
}
