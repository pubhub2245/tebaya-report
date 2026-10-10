"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { SetupTodo, SetupTodoItem } from "@/lib/keiri/setupTodo";

/**
 * 「のこりの手続き」を、経理の画面のいちばん上に出す部品（kp247）。
 *
 * ■ なぜ要るのか（2026-10-10・B）
 *   じゅんにしかできない一度きりの手続き（倉庫の貼り紙・金庫を数える・サーバー側の鍵）は、
 *   入口が3か所に散っていて、**どこからも互いにリンクしていませんでした**。
 *   じゅんがふだん開くのは /keiri なのに、そこにのこり2つが出ないので、
 *   お願いが司令室に積まれる一方で、画面には1件も出ない状態が7日 続きました。
 *   ここに出せば、**1画面 開けば のこり全部が見えて、それぞれ1タップで行けます。**
 *
 * ■ 守ること
 *   ・手羽屋として開いているときだけ出す（お店に「倉庫に貼り紙を」とは出さない）
 *   ・のこりが0件なら何も出さない（ふだんの画面を1ミリも邪魔しない）
 *   ・読めなければ黙って出さない。**この部品が落ちても経理の画面は今までどおり**
 *   ・鍵・合言葉・金額は1文字も出さない（窓口も返しません）
 */
export default function SetupTodoCard() {
  const [todo, setTodo] = useState<SetupTodo | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/keiri/setuptodo", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Partial<SetupTodo> | null;
        if (!alive || !json || !Array.isArray(json.items)) return;
        setTodo(json as SetupTodo);
      } catch {
        // 読めなければ何も出さない（ふだんの画面を止めない）
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!todo) return null;
  const left = todo.items.filter((i) => i.state !== "済み");
  if (left.length === 0) return null;

  return (
    <section className="card border-2 border-amber-300 bg-amber-50">
      <h2 className="text-lg font-bold text-amber-900">
        🙋 のこりの手続き（じゅんだけ・{todo.remaining}件）
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-amber-900">{todo.summary}</p>
      <ol className="mt-3 space-y-3">
        {left.map((item, i) => (
          <li key={item.id}>
            <Row item={item} no={i + 1} />
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-amber-800">
        ※ どれも一度きりで、数分で終わります。順番はこのままで大丈夫です。
        済んだものはこの欄から消えます。
      </p>
    </section>
  );
}

function Row({ item, no }: { item: SetupTodoItem; no: number }) {
  const unknown = item.state === "分からない";
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold text-white">
          {no}
        </span>
        <span className="font-bold text-stone-900">{item.title}</span>
        <span className="text-xs text-stone-500">{item.minutes}</span>
        {unknown && (
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
            確かめられませんでした
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-stone-700">{item.benefit}</p>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">いまの状態：{item.detail}</p>
      <div className="mt-2">
        {item.href === "/keiri" ? (
          <a href="#kinko" className="btn-secondary text-sm">
            この画面の「🔐 金庫を数えて、合っているか見る」へ ↓
          </a>
        ) : (
          <Link href={item.href} className="btn-secondary text-sm">
            この1枚をひらく →
          </Link>
        )}
      </div>
    </div>
  );
}
