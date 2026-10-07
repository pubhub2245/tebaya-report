import type { Metadata } from "next";
import Link from "next/link";

import {
  KEY_BLOCKED,
  KEY_FIX_STEPS,
  keyFixHeadline,
  keyFixLevel,
  keyFixNeeded,
} from "@/lib/keiri/keyFix";
import { describeServerKey } from "@/lib/keiri/serverHealth";
import { serviceRoleKeyRepair, serviceRoleKeyStatus } from "@/lib/supabaseServer";

/**
 * サーバー側の鍵を貼り直す1枚（/keiri/key）
 *
 * ■ なぜこの1枚が要るのか（2026-10-07 18:34 B）
 *   本番の鍵の欄には、鍵ではないものが入っています（約700文字・うち日本語が約450文字・改行12個）。
 *   そのあいだ **毎日の自動の控え（バックアップ）が取れず**、お申し込みの控えを一覧で読み返せず、
 *   2軒目のお店の行も作れません（仕上げの f5-4 の1手目）。
 *   いちばん大きい行き止まりなのに、「どこを見て・何をすれば直るか」が1枚になっていませんでした。
 *
 * ■ ここに値は出しません
 *   鍵の値・合言葉・環境変数の中身は1文字も出しません（配信中に映っても大丈夫な作りです）。
 *   出すのは「使えるか」と「なぜ使えないか（文字数などの形だけ）」です。
 *
 * ■ 毎回その場で見ます
 *   出来上がったページに焼き付けると、貼り直したあとも古い答えが出てしまうので、
 *   開くたびに今の状態を見ます（force-dynamic）。
 */
export const metadata: Metadata = {
  title: "サーバー側の鍵を貼り直す",
  robots: { index: false, follow: false },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function KeiriKeyPage() {
  const repair = serviceRoleKeyRepair();
  const report = describeServerKey(serviceRoleKeyStatus(), {
    repaired: repair.repaired,
    broken: repair.broken,
  });
  const level = keyFixLevel(report);
  const needs = keyFixNeeded(level);
  const tone =
    level === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : level === "repaired"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-rose-300 bg-rose-50 text-rose-900";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-bold text-stone-900 leading-snug">
          サーバー側の鍵を貼り直す（1分）
        </h1>
        <p className="text-sm text-stone-600 leading-relaxed">
          この1枚は、<strong>Vercel（サイトが動く場所）に預けてある鍵</strong>が
          ちゃんと使える状態かを、その場で見るためのものです。
          鍵の中身はどこにも出しません。
        </p>
      </header>

      <section className={`rounded-xl border p-4 space-y-2 ${tone}`}>
        <p className="text-base font-bold leading-snug">{keyFixHeadline(level)}</p>
        <p className="text-sm leading-relaxed">{report.note}</p>
      </section>

      {needs && !report.usable && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-stone-900">直るまで止まっているもの</h2>
          <ul className="space-y-2">
            {KEY_BLOCKED.map((b) => (
              <li key={b.what} className="rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm font-bold text-stone-900">{b.what}</p>
                <p className="text-sm text-stone-600 leading-relaxed">{b.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {needs && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-stone-900">やること（4手・合計1分）</h2>
          <ol className="space-y-2">
            {KEY_FIX_STEPS.map((s) => (
              <li key={s.no} className="rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm font-bold text-stone-900">
                  {s.no} {s.where}
                </p>
                <p className="text-sm text-stone-700 leading-relaxed">{s.what}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-stone-500 leading-relaxed">
            ※ 貼るときは、まわりの説明文や改行が混ざらないようにします。
            いま入っている値は、鍵ではなく文章のように見えています（日本語と改行が入っています）。
          </p>
        </section>
      )}

      <section className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-2">
        <h2 className="text-base font-bold text-stone-900">ついでに、もう1枚（2分）</h2>
        <p className="text-sm text-stone-700 leading-relaxed">
          倉庫（業務データの保管庫）に<strong>棚を4つ足す貼り紙</strong>も、同じく1回だけで済みます。
          こちらが済むと、金庫との突き合わせ・重なった支払いの片付け・レシート写真の拾い直しが動きます。
        </p>
        <Link
          href="/keiri/sql"
          className="inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-bold text-white"
        >
          倉庫に貼る1枚を開く
        </Link>
      </section>

      <p className="text-xs text-stone-500 leading-relaxed">
        この画面は検索に出しません。鍵の値・合言葉は1文字も出しません。
        外から同じことを確かめる窓口は <code>/api/keiri/keycheck</code> です。
      </p>
    </main>
  );
}
