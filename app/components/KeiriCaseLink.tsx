import Link from "next/link";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import {
  APP_CASE_HREF,
  APP_LINK_ACTION,
  APP_LINK_LABEL,
  APP_SHOW_HREF,
  APP_SHOW_LABEL,
  appLinkNote,
} from "@/lib/keiri/appLink";

/**
 * 日報アプリの画面のいちばん下に置く、経理パッケージのご案内への1行（kp200）。
 *
 * ・文章と行き先は lib/keiri/appLink.ts が唯一の正（ここに直書きしない）
 * ・値段は lib/keiri/caseNumbers.ts からだけ読む
 * ・日報・売上のデータは1行も読まない。押さなければ何も起きない
 * ・「use client」を付けない＝ホーム（サーバー側で作る画面）でも
 *   管理者ページ（ブラウザ側で動く画面）でも、同じ1つが使える
 *
 * ★押せる所は**指の幅（44px）以上**にする。
 *   最初の版は文字の高さ（18px）しか無く、本物のスマホ（390×844）で測ったら
 *   指で押しにくい大きさだった。余白（padding）は文字ではなく**押す所の中**に置く。
 */
export default function KeiriCaseLink() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 text-left overflow-hidden">
      <Link href={APP_CASE_HREF} className="block px-4 py-3 hover:bg-stone-100">
        <span className="flex items-center justify-between gap-2 text-sm font-bold text-stone-700">
          <span className="leading-tight">{APP_LINK_LABEL}</span>
          <span className="shrink-0 text-xs underline">{APP_LINK_ACTION} →</span>
        </span>
        <span className="mt-1 block text-xs text-stone-500 leading-snug">
          {appLinkNote(priceLabel())}
        </span>
      </Link>
      <Link
        href={APP_SHOW_HREF}
        className="block min-h-[44px] border-t border-stone-200 px-4 py-3 text-xs text-stone-500 underline hover:bg-stone-100 hover:text-stone-700"
      >
        {APP_SHOW_LABEL} →
      </Link>
    </div>
  );
}
