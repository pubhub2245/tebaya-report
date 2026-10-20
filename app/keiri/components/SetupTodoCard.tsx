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
export default function SetupTodoCard({ here }: { here?: string } = {}) {
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
  /**
   * いま開いている1枚のことは出さない（「この1枚をひらく」が自分自身になるため）。
   *
   * ★ただし「金庫を数える」だけは例外（2026-10-15・f1-4）。
   *   行き先が同じ /keiri でも、**その画面の下のほうにある別の欄**なので、
   *   出さないと じゅんが毎日ひらく画面に この1分が1件も見えません
   *   （実際に「↓ この画面の…へ」の案内は、ここで外れていたため一度も出ていませんでした）。
   */
  const left = todo.items.filter(
    (i) => i.state !== "済み" && (i.href !== here || i.id === "cash"),
  );
  if (left.length === 0) return null;

  return (
    <section className="card border-2 border-amber-300 bg-amber-50">
      <h2 className="text-lg font-bold text-amber-900">
        🙋 のこりの手続き（じゅんだけ・{todo.remaining}件）
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-amber-900">{todo.summary}</p>
      {/* ★「上が済むまで下は意味が無い」と読まれないように出す（2026-10-15・f1-4）。
             実際にそう読まれて、1分で済む手続きが2分の手続きを待っていました。 */}
      {todo.independentNote && (
        <p className="mt-1 text-sm font-bold leading-relaxed text-amber-900">
          {todo.independentNote}
        </p>
      )}
      <ol className="mt-3 space-y-3">
        {left.map((item, i) => (
          <li key={item.id}>
            <Row item={item} no={i + 1} here={here} />
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-amber-800">
        ※ どれも一度きりで、数分で終わります。<strong>どれから押しても大丈夫です</strong>
        （並びはおすすめの順だけで、互いに待っていません）。
        済んだものはこの欄から消えます。
      </p>
    </section>
  );
}

function Row({ item, no, here }: { item: SetupTodoItem; no: number; here?: string }) {
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
      {/* ★押すボタンを順番どおりに出す（2026-10-15・f1-4）。
             2026-10-20：控えの道は1押しで残るようになったので、**1つのときも出す**
             （「押すのは1回です」と言い切るため。出さないと何回 押すのか分からない）。 */}
      {item.presses && item.presses.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-stone-700">
          押すのは{item.presses.length}回です：
          {item.presses.map((t, i) => (
            <span key={t}>
              {i > 0 ? " → " : ""}
              <strong>［{t}］</strong>
            </span>
          ))}
        </p>
      )}
      <div className="mt-2">
        {item.href === "/keiri" && here === "/keiri" ? (
          <a href="#kinko" className="btn-primary text-sm">
            ↓ この画面の「🔐 金庫を数えて、合っているか見る」へ
          </a>
        ) : (
          <Link
            href={item.href === "/keiri" ? "/keiri#kinko" : item.href}
            className="btn-secondary text-sm"
          >
            この1枚をひらく →
          </Link>
        )}
      </div>
    </div>
  );
}
