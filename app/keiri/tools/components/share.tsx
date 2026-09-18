"use client";

import { useCallback, useEffect, useState } from "react";

import { buildShareQuery, readShareParams } from "@/lib/keiri/tools";

/**
 * 入れた数字を URL に持たせて、そのまま人に渡せるようにする部品（kp37）。
 *
 * ★数字はブラウザの中だけで扱う。URL に入れて運ぶだけで、うちのサーバーには送らない。
 * ★最初の描画では URL を読まない（サーバーで作った画面と食い違うと警告が出るため）。
 *   画面が出たあとに1回だけ読み込む。
 */
export function useShareableNumbers(defaults: Record<string, string>) {
  const [values, setValues] = useState<Record<string, string>>(defaults);
  const [ready, setReady] = useState(false);

  // 開いた直後に1回だけ、URL に入っていた数字を読み込む
  useEffect(() => {
    setValues(readShareParams(window.location.search, defaults));
    setReady(true);
    // defaults は画面ごとに固定なので、読み込みは1回でよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数字が変わったら、いまの URL を静かに書き換える（履歴は増やさない）
  useEffect(() => {
    if (!ready) return;
    const query = buildShareQuery(values);
    window.history.replaceState(null, "", `${window.location.pathname}${query}`);
  }, [values, ready]);

  const setValue = useCallback((key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  }, []);

  /** いま画面に出ている数字が入ったリンク */
  const shareUrl = useCallback(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${window.location.pathname}${buildShareQuery(values)}`;
  }, [values]);

  return { values, setValue, shareUrl };
}

/** 「この結果をコピー」のボタン。押すと答えの文章とリンクが控えに入る */
export function CopyResultButton({ text, disabled }: { text: () => string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  const copy = useCallback(async () => {
    const body = text();
    try {
      // 使えないブラウザ（古い端末・保護された画面）では下のやり方に落ちる
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(body);
      } else {
        const area = document.createElement("textarea");
        area.value = body;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setState("done");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2500);
  }, [text]);

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={copy}
        disabled={disabled}
        className="w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-bold text-stone-900 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {state === "done" ? "コピーしました" : state === "failed" ? "コピーできませんでした" : "この結果をコピー"}
      </button>
      <p className="mt-2 text-xs text-stone-500 leading-relaxed">
        答えと、いまの数字が入ったリンクをまとめて控えに入れます。LINE やメールにそのまま貼れます。
        {state === "failed" && "（お使いの画面ではコピーができませんでした。アドレス欄の URL をそのままお使いください。）"}
      </p>
    </div>
  );
}
