"use client";

import { useState } from "react";

import {
  photoLockHeadline,
  photoLockWhy,
  type PhotoLockState,
} from "@/lib/keiri/photoLock";

/**
 * 「レシート写真の置き場を閉める」1押し（f3-4・2026-10-26）
 *
 * 置き場はいま「公開」で、住所を知っていれば合言葉なしで1枚ずつ開けます。
 * 画面を窓口ごしにする工事は済んでいて、残っているのは**置き場を閉める1手**だけです。
 * それを作れるのはサーバー側の鍵だけなので、この1枚（/keiri/key）の中に置きます。
 * ＝ 鍵を貼り直したその場で、続けて1回 押せば終わります。
 *
 * ★押すまで何も起きません。押したあとの確かめ（閉める前後に写真が読めるか）と、
 *   読めなくなったときの戻しは、すべてサーバー側で自動で行います（→ /api/keiri/photo-lock）。
 */
export default function PhotoLockCard({ state }: { state: PhotoLockState }) {
  const [pressed, setPressed] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  const tone =
    state === "locked" || ok === true
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : state === "ready"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-stone-200 bg-white text-stone-800";

  async function press() {
    setPressed(true);
    setSaid(null);
    try {
      const res = await fetch("/api/keiri/photo-lock", { method: "POST" });
      const body = (await res.json()) as { ok?: boolean; said?: string };
      setOk(body.ok === true);
      setSaid(body.said ?? "答えを読めませんでした");
    } catch {
      setOk(false);
      setSaid("通信に失敗しました。もう一度 押してみてください（何も変わっていません）");
    } finally {
      setPressed(false);
    }
  }

  return (
    <section className={`rounded-xl border p-4 space-y-2 ${tone}`}>
      <h2 className="text-base font-bold">⑤ レシート写真の置き場（あと1押し）</h2>
      <p className="text-sm font-bold leading-snug">{photoLockHeadline(state)}</p>
      <p className="text-sm leading-relaxed">{photoLockWhy(state)}</p>

      {state === "ready" && ok !== true && (
        <button
          type="button"
          onClick={press}
          disabled={pressed}
          className="inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {pressed ? "確かめています…" : "レシート写真の置き場を閉める"}
        </button>
      )}

      {said && (
        <p className="rounded-lg bg-white/70 p-3 text-sm leading-relaxed">{said}</p>
      )}

      <p className="text-xs leading-relaxed opacity-80">
        外から同じことを確かめる窓口は <code>/api/keiri/photo-lock</code>（読むだけ）と{" "}
        <code>/api/keiri/photos</code> です。写真の中身・住所は1文字も出しません。
      </p>
    </section>
  );
}
