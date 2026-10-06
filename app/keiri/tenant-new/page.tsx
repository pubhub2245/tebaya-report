import type { Metadata } from "next";
import Link from "next/link";

/**
 * 2軒目のお店を入れる「手順の1枚」（/keiri/tenant-new）
 *
 * ■ なぜこの1枚が要るのか（2026-10-06・kp235・f5-4）
 *   経理パッケージは「2軒目を入れられること」が商品の形そのものですが、
 *   その手順は **まだ一度も端から端まで通っていません**。
 *   手順が人の頭の中にしかないと、入れるたびに思い出すところから始まり、
 *   抜けたところで止まります。ここに置けば、次からは読むだけで同じように通せます。
 *
 * ■ ここに書かないもの
 *   合言葉・鍵・環境変数の値は1文字も書きません（配信に映っても大丈夫な前提・CLAUDE.md）。
 *   お店の初期設定リンクも書きません（リンクそのものが合言葉のため）。
 *
 * ■ 運営だけが使う1枚なので noindex
 */
export const metadata: Metadata = {
  title: "2軒目のお店を入れる手順",
  robots: { index: false, follow: false },
};

type Step = {
  no: string;
  title: string;
  who: "運営" | "お店";
  minutes: string;
  body: React.ReactNode;
};

const STEPS: Step[] = [
  {
    no: "1",
    title: "お店1軒ぶんの行を作る",
    who: "運営",
    minutes: "1分",
    body: (
      <>
        業務データの保管庫（Supabase）の <strong>SQL Editor</strong> に、下の1行を貼って実行します。
        <strong>書き換えるのは店名の1か所だけ</strong>です。
        <pre className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-800 whitespace-pre">
          {"select * from public.keiri_tenant_create_manual('ここにお店の名前を入れる');"}
        </pre>
        返ってくる <code>setup_path</code>（例 <code>/keiri/welcome?t=…</code>）が、そのお店の
        <strong>初期設定リンク</strong>です。
        <br />
        <span className="text-stone-600">
          ★ この窓口は、外から呼べないように閉じてあります（誰でもお店を作れてはいけないため）。
          安全のための決まりなので開けません。だからこの1手だけは、
          保管庫の画面を開ける人が行います。
        </span>
      </>
    ),
  },
  {
    no: "2",
    title: "初期設定リンクをお店に渡す",
    who: "運営",
    minutes: "1分",
    body: (
      <>
        本番の住所の後ろに付けて渡します（LINE など、本人だけが見るところへ）。
        <br />
        <strong>このリンクは合言葉そのものです。</strong>
        人に見えるところ（投稿・画面共有・紙）へ貼らないでください。
      </>
    ),
  },
  {
    no: "3",
    title: "お店が「はじめの設定」を3つ入れる",
    who: "お店",
    minutes: "3分",
    body: (
      <>
        リンクを開くと入れる所は3つだけです。
        <ol className="mt-1 list-decimal pl-5 space-y-0.5">
          <li>お店の名前</li>
          <li>数え始めの日（この日からの数字を出します）</li>
          <li>その日の手元の現金（レジ＋金庫の合計・円）</li>
        </ol>
        入れて押すと、<strong>管理画面に入る合言葉がその画面に1回だけ出ます。</strong>
        控えないと作り直しになるので、スクリーンショットを撮っていただきます。
      </>
    ),
  },
  {
    no: "4",
    title: "出店場所を入れる",
    who: "お店",
    minutes: "5分",
    body: (
      <>
        管理者ページの<strong>出店場所マスタ</strong>に、ふだん出ている場所を入れます。
        場代の決まり（なし／売上の◯％／定額）もここで入れます。
        <br />
        <span className="text-stone-600">
          ★ 場代は入れておくと日報に自動で入ります。分からないところは「なし」のままにします
          （0円の行を作らないため）。
        </span>
      </>
    ),
  },
  {
    no: "5",
    title: "日報を1枚 打つ",
    who: "お店",
    minutes: "5分",
    body: (
      <>
        営業後日報を1枚 入れます。これが入ると、
        <strong>その日のうちに「今月の利益」と「今の現金」が出ます</strong>
        （出るかどうかが、仕上げチェック表の f3-3 です）。
      </>
    ),
  },
  {
    no: "6",
    title: "経理の画面に入れるか確かめる",
    who: "運営",
    minutes: "2分",
    body: (
      <>
        <Link href="/keiri" className="underline">
          /keiri
        </Link>{" "}
        を開き、手順3で出た合言葉で入ります。出てくる数字が
        <strong>そのお店のものだけ</strong>であること（手羽屋の数字が1円も出ないこと）を見ます
        （仕上げチェック表の f3-4）。
      </>
    ),
  },
];

export default function KeiriTenantNewPage() {
  const total = "17分";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-bold text-stone-900 leading-snug">
          2軒目のお店を入れる手順（目安 {total}）
        </h1>
        <p className="text-sm text-stone-700 leading-relaxed">
          お申し込みが決まったお店を、経理パッケージで使い始められる状態にするまでの
          <strong>6手</strong>です。上から順にやれば、思い出す所はありません。
          合言葉・鍵の値はこの紙に1文字も書いていません。
        </p>
      </header>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 space-y-2">
        <h2 className="text-base font-bold text-stone-900">先に知っておくこと</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-stone-800 leading-relaxed">
          <li>
            <strong>保管庫の画面を開くのは、手順1の1回だけ</strong>です。あとはぜんぶ、
            ふつうのブラウザの画面で終わります。
          </li>
          <li>
            お店が入れるのは<strong>3項目＋出店場所</strong>だけです。こちらが代わりに入れる
            必要はありません。
          </li>
          <li>
            手羽屋の日報・シフト・レジ・LINE には<strong>一切ふれません</strong>。
            新しいお店の行が増えるだけです。
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-stone-900">手順（6手）</h2>
        <ol className="space-y-3">
          {STEPS.map((s) => (
            <li key={s.no} className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-stone-900">
                  {s.no}. {s.title}
                </span>
                <span className="text-[11px] text-stone-600">
                  （{s.who}・{s.minutes}）
                </span>
              </div>
              <div className="mt-1.5 text-sm text-stone-800 leading-relaxed">{s.body}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 space-y-2">
        <h2 className="text-base font-bold text-stone-900">まだ通していません（正直に書きます）</h2>
        <p className="text-sm text-stone-800 leading-relaxed">
          この6手は、<strong>まだ一度も端から端まで通していません</strong>。
          通すには「まだ初期設定前のお店の行」が1つ必要で、それを作れるのは
          保管庫の画面を開ける人だけです（手順1）。
          お店を作る窓口を外から呼べるようにすれば こちら側だけで通せますが、
          <strong>それは誰でもお店を作れる状態にすることなので、やりません。</strong>
        </p>
        <p className="text-sm text-stone-800 leading-relaxed">
          ですので、端から端まで通すのは<strong>最初の1軒が決まった日</strong>になります。
          手順1を1回 流していただければ、手順2〜6はこの紙のとおりに進みます。
          かかった時間は、通したあとこの紙に書き足します。
        </p>
      </section>

    </main>
  );
}
