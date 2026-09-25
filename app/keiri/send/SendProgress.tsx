"use client";

import { useEffect, useState } from "react";

import {
  OUTREACH_SENT_KEY,
  markNextSent,
  parseSent,
  sentProgress,
  serializeSent,
  undoLastSent,
} from "@/lib/keiri/outreach";

/**
 * 「送る1枚」の控え（kp171）。**何軒送ったかだけ**を数える。
 *
 * ■ 直したこと（やさしい説明）
 *   この1枚の最後には「どこに送ったかの控えは、ホームに出る帯で付けられます」と
 *   書いてありました。ところが帯が出るには、端末に印（kp150）を付ける1タップが要ります。
 *   そして この1枚は、**その印を要らなくするために作ったもの**です。
 *   ＝「印が要らない道です」と言っておきながら、控えを付けるには印をどうぞ、
 *   という案内になっていました。印はまだ一度も付いていないので、
 *   この1枚から送っても控えは1つも残りません。
 *   翌日また開いたとき、何軒送ったかが分からないままになります。
 *
 * ■ お店の呼び名は出しません
 *   この住所は合言葉が要らない＝誰でも開けるので、送り先8軒の呼び名・連絡先・値段は
 *   1つも出しません（kp162 の決まり）。出すのは数だけです。
 *
 * ■ 控えの置き場は帯とまったく同じ
 *   帯と別に持つと数が食い違うので、帯と同じ1か所（この端末の中）に、
 *   帯と同じ順番で足します。倉庫には1行も送りません。
 *
 * ■ JavaScript が動かないとき
 *   何も出しません（控えは端末の中にしか無いので、出すと嘘になるため）。
 *   送るボタンと送る文は、この部品の外にあるので消えません。
 */
export default function SendProgress() {
  const [sent, setSent] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      setSent(parseSent(localStorage.getItem(OUTREACH_SENT_KEY)));
    } catch {
      setSent([]);
    }
  }, []);

  // 読み込む前は何も出さない（一瞬「0軒」と出てから直る、を避ける）
  if (sent === null) return null;

  const save = (next: string[]) => {
    setSent(next);
    try {
      localStorage.setItem(OUTREACH_SENT_KEY, serializeSent(next));
    } catch {}
  };

  const { done, total, remaining } = sentProgress(sent);
  const allDone = remaining === 0;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-3 space-y-2">
      <h2 className="text-sm font-bold text-stone-900">送った軒数の控え</h2>
      <p className="text-sm text-stone-800 leading-relaxed">
        {allDone ? (
          <>
            <strong>8軒すべてに送りました。</strong>あとは返事を待つだけです。
          </>
        ) : (
          <>
            送りました <strong>{done} / {total} 軒</strong>（あと {remaining} 軒）。
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {!allDone && (
          <button
            type="button"
            onClick={() => save(markNextSent(sent))}
            className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-900 hover:bg-stone-100 transition"
          >
            送りました（1軒）
          </button>
        )}
        {done > 0 && (
          <button
            type="button"
            onClick={() => save(undoLastSent(sent))}
            className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:bg-stone-100 transition"
          >
            1つ取り消す
          </button>
        )}
      </div>

      <p className="text-xs text-stone-600 leading-relaxed">
        数えるのは軒数だけです（この住所は誰でも開けるので、どのお店かは出しません）。
        控えはこの端末の中にだけ残ります。倉庫には1行も送りません。
      </p>
    </section>
  );
}
