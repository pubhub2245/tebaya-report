import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";

import { SHELF_STEPS } from "@/lib/keiri/shelves";
import { sqlEditorUrl } from "@/lib/keiri/warehouseLinks";
import { CopyButton, ShelfStatus } from "./SqlSheet";

/**
 * 倉庫に1回だけ流す「貼り紙」（/keiri/sql）
 *
 * ■ なぜこの1枚が要るのか（2026-10-05・kp237）
 *   いま司令室には、倉庫（Supabase）へ SQL を流せる係が1人もいません
 *   （サーバー側の合鍵が壊れており、A も B も倉庫への書き込みを禁じられています）。
 *   そのため、棚が無いせいで止まっている仕事は、どれだけコードを書いても前に進みません：
 *     ・金庫を数えた記録と突き合わせる（f1-4）
 *     ・同じ支払いの重なりを片付ける（f1-5）
 *     ・レシート写真から読み取る行を選ぶ（f1-6）
 *     ・お店が増えても立替が混ざらないようにする（f3-4）
 *   この1枚は、その足りない棚を**まとめて1回で足す**ためのものです。
 *   じゅんの手は「開く → コピー → 倉庫に貼る → Run」の2分だけです。
 *
 * ■ 中身は足すだけ
 *   消す・名前を変える・作り変える命令は1つも入っていません（drop / delete / truncate なし）。
 *   何度流しても同じ結果です。手羽屋が毎日使う画面の棚は触っていません。
 *
 * ■ SQL の文はどこから来るか
 *   倉庫のファイル（supabase/migrations/*.sql）を**組み立てのときに読み込んで**
 *   そのまま出しています。画面用に書き写していないので、ファイルと画面がずれません。
 *
 * ■ 検索には出さない
 *   運営だけが使う1枚なので noindex。合言葉・鍵の値は1文字も出しません。
 */
export const metadata: Metadata = {
  title: "倉庫に1回だけ流す貼り紙",
  robots: { index: false, follow: false },
};

/** 組み立てのときに読む（出来上がったページの中に文が入る） */
function readSql(file: string): string {
  try {
    return readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8").trim();
  } catch {
    return `-- ${file} が読めませんでした。倉庫の supabase/migrations/${file} を直接ご覧ください。`;
  }
}

const SHEET_FILE = "keiri_shelves_20261005.sql";
const APPLICATIONS_FILE = "keiri_applications_optional_contact.sql";

export default function KeiriSqlPage() {
  const sheet = readSql(SHEET_FILE);
  const applications = readSql(APPLICATIONS_FILE);
  // 倉庫の SQL Editor への行き先（lib/keiri/warehouseLinks.ts）。
  // 読めなければリンクを出さず、今までどおり文だけ残す（間違った所へ送らないため）
  const editor = sqlEditorUrl();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-bold text-stone-900 leading-snug">
          倉庫に1回だけ流す貼り紙（2分）
        </h1>
        <p className="text-sm text-stone-700 leading-relaxed">
          Supabase（業務データの保管庫）に、足りない<strong>置き場（棚）</strong>を足します。
          <strong>足すだけ</strong>で、消す・書き換える命令は1つも入っていません。
          何度流しても同じ結果になります。手羽屋が毎日使う画面（日報・シフト・レジ・LINE）の
          棚は触っていません。
        </p>
      </header>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
        <h2 className="text-base font-bold text-stone-900">やること（3手）</h2>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-stone-800 leading-relaxed">
          <li>下の［貼り紙をぜんぶコピーする］を押す</li>
          <li>
            {editor ? (
              <>
                下の［倉庫の貼る場所をひらく］を押す（新しいタブで、貼る所がそのまま開きます）
              </>
            ) : (
              <>
                Supabase を開き、左の <strong>SQL Editor</strong> に貼って{" "}
                <strong>Run</strong> を押す
              </>
            )}
          </li>
          <li>
            大きな白い枠の中に貼って、<strong>Run</strong>（右下の緑のボタン）を押す
          </li>
          <li>このページをもう一度ひらく（下の「いまの状態」が「ある」に変わります）</li>
        </ol>
        <CopyButton text={sheet} label="貼り紙をぜんぶコピーする" />
        {editor && (
          /* ★行き先は倉庫の住所から組み立てています（lib/keiri/warehouseLinks.ts）。
             鍵・合言葉は1文字も入っていません。 */
          <a
            href={editor}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-xl bg-stone-800 px-4 py-3 text-center text-sm font-bold text-white"
          >
            倉庫の貼る場所をひらく（新しいタブ）
          </a>
        )}
        <p className="text-xs text-stone-600 leading-relaxed">
          押しても何も起きないとき（古いブラウザなど）は、下の文を長押しでコピーしてください。
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
        <h2 className="text-base font-bold text-stone-900">
          これを流すと、何ができるようになるか
        </h2>
        <ul className="space-y-2">
          {SHELF_STEPS.map((s) => (
            <li key={s.key} className="text-sm text-stone-800 leading-relaxed">
              <strong>
                {s.step} {s.name}
              </strong>
              <br />
              <span className="text-stone-700">{s.benefit}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
        <h2 className="text-base font-bold text-stone-900">いまの状態</h2>
        <p className="text-xs text-stone-600 leading-relaxed">
          本番の倉庫を<strong>読むだけ</strong>で確かめています（1行も書き込みません）。
          同じ内容は{" "}
          <Link href="/api/keiri/shelves" className="underline">
            /api/keiri/shelves
          </Link>{" "}
          でも見られます。
        </p>
        <ShelfStatus />
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-stone-900">貼り紙の中身（{SHEET_FILE}）</h2>
        <pre className="overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-800 whitespace-pre">
          {sheet}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-stone-900">
          おまけ：申し込みの控えの決まり（まだ流していなければ、こちらも1回）
        </h2>
        <p className="text-sm text-stone-700 leading-relaxed">
          お申し込みが棚に必ず1行 残るようにする決まりです。流れているかは{" "}
          <Link href="/api/keiri/diagnose" className="underline">
            /api/keiri/diagnose
          </Link>{" "}
          の「申し込みの控え」で分かります（いまは応急の回り道が本番に入っているので、
          流していなくてもお申し込みは消えません）。
        </p>
        <CopyButton text={applications} label="こちらもコピーする" />
        <pre className="overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-800 whitespace-pre">
          {applications}
        </pre>
      </section>
    </main>
  );
}
