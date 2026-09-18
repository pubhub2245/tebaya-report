"use client";

import { useState } from "react";

import { KEIRI_APPLY_LIMITS } from "@/lib/keiri/apply";

/**
 * 経理パッケージの申し込みの入力欄。
 *
 * ★入れてもらうのは4つだけ（お店の名前・お名前・メール・電話）。
 *   多く聞くほど途中でやめられるので、こちらから折り返すのに要るものだけにしている。
 * ★送り先は /api/keiri/apply の1か所だけ。
 * ★お金のやり取りはここではしない（カード番号は入れてもらわない）。
 */

const LABEL = "block text-sm font-bold text-stone-700";
const INPUT =
  "mt-1 w-full h-12 rounded-xl border border-stone-300 px-3 text-base text-stone-900 " +
  "focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200";

type State = "input" | "sending" | "done";

export default function ApplyForm({ email }: { email: string }) {
  const [state, setState] = useState<State>("input");
  const [errors, setErrors] = useState<string[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;

    const f = new FormData(e.currentTarget);
    setErrors([]);
    setState("sending");

    try {
      const res = await fetch("/api/keiri/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shopName: f.get("shopName"),
          contactName: f.get("contactName"),
          email: f.get("email"),
          phone: f.get("phone"),
          note: f.get("note"),
          website: f.get("website"),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        errors?: string[];
      };
      if (res.ok && data.ok) {
        setState("done");
        return;
      }
      setErrors(
        data.errors && data.errors.length > 0
          ? data.errors
          : [`うまく送れませんでした。お手数ですが ${email} までご連絡ください。`],
      );
      setState("input");
    } catch {
      setErrors([
        `うまく送れませんでした。通信の具合を確かめるか、${email} までご連絡ください。`,
      ]);
      setState("input");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
        <p className="text-lg font-bold text-stone-900">お申し込みを受け付けました。</p>
        <p className="mt-3 text-stone-700 leading-relaxed">
          担当から、いただいたメールアドレスへご連絡します（通常1営業日以内）。
          お支払いの方法と、使い始めるための準備もそのときにご案内します。
          こちらから何かを差し引くことはありませんので、そのままお待ちください。
        </p>
        <p className="mt-3 text-sm text-stone-600">
          お急ぎのときは{" "}
          <a href={`mailto:${email}`} className="underline font-bold">
            {email}
          </a>{" "}
          までご連絡ください。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {errors.length > 0 && (
        <ul className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-1">
          {errors.map((m) => (
            <li key={m} className="text-sm text-red-700">
              {m}
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className={LABEL} htmlFor="shopName">
          お店の名前 <span className="text-red-600">必須</span>
        </label>
        <input
          id="shopName"
          name="shopName"
          required
          maxLength={KEIRI_APPLY_LIMITS.shopName}
          autoComplete="organization"
          className={INPUT}
          placeholder="例：屋台 手羽屋"
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="contactName">
          お名前 <span className="text-red-600">必須</span>
        </label>
        <input
          id="contactName"
          name="contactName"
          required
          maxLength={KEIRI_APPLY_LIMITS.contactName}
          autoComplete="name"
          className={INPUT}
          placeholder="例：川畑 潤一郎"
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="email">
          メールアドレス <span className="text-red-600">必須</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={KEIRI_APPLY_LIMITS.email}
          autoComplete="email"
          inputMode="email"
          className={INPUT}
          placeholder="例：you@example.com"
        />
        <p className="mt-1 text-xs text-stone-500">ご連絡はこの宛先にお送りします。</p>
      </div>

      <div>
        <label className={LABEL} htmlFor="phone">
          電話番号（任意）
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          maxLength={KEIRI_APPLY_LIMITS.phone}
          autoComplete="tel"
          inputMode="tel"
          className={INPUT}
          placeholder="例：090-0000-0000"
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="note">
          ひとこと（任意）
        </label>
        <textarea
          id="note"
          name="note"
          rows={4}
          maxLength={KEIRI_APPLY_LIMITS.note}
          className="mt-1 w-full rounded-xl border border-stone-300 p-3 text-base text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          placeholder="いま困っていること、聞いておきたいことがあればどうぞ。"
        />
      </div>

      {/* 人には見えない囮の欄。機械の書き込みだけがここを埋める */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <button
        type="submit"
        disabled={state === "sending"}
        className="flex items-center justify-center w-full h-14 rounded-2xl bg-amber-500 text-white font-bold text-lg shadow hover:bg-amber-600 disabled:opacity-60 transition"
      >
        {state === "sending" ? "送っています…" : "この内容で申し込む"}
      </button>

      <p className="text-xs text-stone-500 leading-relaxed">
        この画面ではお支払いは発生しません。いただいた内容をもとに、担当からお支払いの方法をご案内します。
        いただいた連絡先は、このご案内以外には使いません。
      </p>
    </form>
  );
}
