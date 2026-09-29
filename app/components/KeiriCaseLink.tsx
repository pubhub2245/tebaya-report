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
 */
export default function KeiriCaseLink() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-left">
      <Link
        href={APP_CASE_HREF}
        className="flex items-center justify-between gap-2 text-sm font-bold text-stone-700 hover:text-stone-900"
      >
        <span className="leading-tight">{APP_LINK_LABEL}</span>
        <span className="shrink-0 text-xs underline">{APP_LINK_ACTION} →</span>
      </Link>
      <p className="mt-1 text-xs text-stone-500 leading-snug">
        {appLinkNote(priceLabel())}
      </p>
      <Link
        href={APP_SHOW_HREF}
        className="mt-2 inline-block text-xs text-stone-500 underline hover:text-stone-700"
      >
        {APP_SHOW_LABEL} →
      </Link>
    </div>
  );
}
