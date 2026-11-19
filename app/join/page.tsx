"use client";

/**
 * お店で働く人（スタッフ）の入口（2026-11-19 追加）。
 *
 * スタッフ用の合言葉を1回入れると、この端末が「そのお店のスタッフの端末」になります。
 * ・できること：写真で日報を出す／仕込み・調理マニュアル／過去の日報／使う備品
 * ・出さないもの：今月いま残っているお金（店主だけ）
 * ・手羽屋（ゆうやさんのスーパー出店）の数字は、お店の印で絞ってあるので見えません
 *
 * 合言葉の確認はサーバー側（/api/keiri/login に as:"staff"）。経理の画面（/keiri）では
 * スタッフの合言葉は通りません。打った文字そのものは、どこにも残しません。
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { normalizeTenantScope, writeTenantName, writeTenantScope } from "@/lib/tenantScope";
import { writePhotoShopRole } from "@/lib/photoShopRole";

export default function JoinPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/keiri/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw, as: "staff" }),
      });
      const json = await res.json().catch(() => null);
      const scope = normalizeTenantScope(json?.tenantId);
      if (res.ok && json?.ok && json.role === "staff" && scope) {
        writeTenantScope(scope);
        writeTenantName(json.shopName, undefined, scope);
        writePhotoShopRole("staff");
        router.replace("/");
        return;
      }
    } catch {
      // 通信できなかったときも「違います」と同じ扱い
    } finally {
      setChecking(false);
    }
    setError("合言葉が違います。お店の人に確かめてください。");
  };

  return (
    <main className="max-w-md mx-auto px-4 py-12">
      <form onSubmit={submit} className="rounded-3xl bg-white border border-stone-200 p-6 shadow-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">お店の合言葉</h1>
        <p className="text-sm text-stone-600 text-center">最初の1回だけ入れてください。</p>
        <input
          type="password"
          className="w-full h-14 rounded-2xl border-2 border-stone-200 px-4 text-lg focus:border-orange-500 outline-none"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          autoComplete="off"
          aria-label="合言葉"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={checking || !pw.trim()}
          className="w-full h-14 rounded-2xl bg-orange-500 active:bg-orange-700 disabled:opacity-50 text-white text-lg font-bold"
        >
          {checking ? "確認中…" : "はじめる"}
        </button>
      </form>
    </main>
  );
}
