import type { Metadata } from "next";
import Link from "next/link";

import { KeiriBreadcrumb, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/tools",
  type: "website",
  title: "飲食店の無料計算ツール｜赤字ライン・原価率・FL比率（登録不要）",
  description:
    "飲食店・屋台の数字をその場で出す無料の計算ツール。損益分岐点（赤字にならない売上）と、原価率・FL比率。" +
    "登録もメールアドレスも要りません。入力した数字はどこにも送りません。",
});

const TOOLS: { path: string; title: string; lead: string }[] = [
  {
    path: "/keiri/tools/bunki-ten",
    title: "赤字ラインの計算（損益分岐点）",
    lead: "家賃と原価率を入れると、月にいくら売ればトントンか、1日あたり何円・何人必要かが出ます。",
  },
  {
    path: "/keiri/tools/genka-ritsu",
    title: "原価率・FL比率の計算",
    lead: "1か月の売上・仕入・人件費から、原価率と人件費率、引いたあとに残る額を出します。",
  },
];

export default function KeiriToolsPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "無料の計算ツール" }]} />

      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">無料・登録不要</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          飲食店の数字を、
          <br />
          その場で出す道具。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          登録もメールアドレスも要りません。入れた数字はブラウザの中だけで計算していて、どこにも送っていません。
        </p>
      </header>

      <ul className="space-y-3">
        {TOOLS.map((t) => (
          <li key={t.path}>
            <Link
              href={t.path}
              className="block rounded-xl bg-white border border-stone-200 p-5 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">{t.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{t.lead}</p>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-stone-500 leading-relaxed">
        計算の道具であって、税金や申告の判断はしません。個別の税務のことは税理士にご確認ください。
      </p>

      <div className="mt-12">
        <KeiriRelated current="/keiri/tools" />
      </div>
    </main>
  );
}
