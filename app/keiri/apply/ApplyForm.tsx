"use client";

import { useState } from "react";

import { KEIRI_APPLY_LIMITS, keiriApplyMailto } from "@/lib/keiri/apply";

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

type State = "input" | "sending" | "done" | "fallback";

/** 入れてもらった中身。届けられなかったときに、そのまま使い回すために覚えておく */
type Entered = {
  shopName: string;
  contactName: string;
  email: string;
  phone: string;
  note: string;
};

const EMPTY: Entered = { shopName: "", contactName: "", email: "", phone: "", note: "" };

function readForm(f: FormData): Entered {
  const s = (k: string) => String(f.get(k) ?? "");
  return {
    shopName: s("shopName"),
    contactName: s("contactName"),
    email: s("email"),
    phone: s("phone"),
    note: s("note"),
  };
}

export default function ApplyForm({ email, tel }: { email: string; tel?: string }) {
  const [state, setState] = useState<State>("input");
  const [errors, setErrors] = useState<string[]>([]);
  // ★打ち直しをお願いしないために、入れてもらった中身は必ず手元に残す
  const [entered, setEntered] = useState<Entered>(EMPTY);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;

    const f = new FormData(e.currentTarget);
    const values = readForm(f);
    setEntered(values);
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
        reason?: string;
        errors?: string[];
      };
      if (res.ok && data.ok) {
        setState("done");
        return;
      }
      // ★入力の間違い（400）と、届けられなかった（503）は分けて扱う。
      //   届けられなかったときに「もう一度どうぞ」と出しても、何度押しても同じなので、
      //   その場でメールに切り替えられるようにする（2026-09-19・kp60）。
      if (data.reason === "delivery" || res.status >= 500) {
        setState("fallback");
        return;
      }
      setErrors(
        data.errors && data.errors.length > 0
          ? data.errors
          : [`うまく送れませんでした。お手数ですが ${email} までご連絡ください。`],
      );
      setState("input");
    } catch {
      // 通信そのものが届かなかったときも、行き止まりにしない
      setState("fallback");
    }
  }

  if (state === "fallback") {
    const mail = keiriApplyMailto({ to: email, ...entered });
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
        <p className="text-lg font-bold text-stone-900">
          いま自動の受け付けができませんでした。
        </p>
        <p className="mt-3 text-stone-700 leading-relaxed">
          入れていただいた中身は消えていません。下のボタンを押すと、
          その中身がそのまま入ったメールの下書きが開きます。送信を押していただければ、
          こちらに届きます（打ち直していただく必要はありません）。
        </p>

        <a
          href={mail.url}
          className="mt-5 flex items-center justify-center w-full h-14 rounded-2xl bg-amber-500 text-white font-bold text-lg shadow hover:bg-amber-600 transition"
        >
          メールでそのまま送る
        </a>

        <p className="mt-4 text-sm text-stone-700 leading-relaxed">
          メールが開かないときは、下の文をそのまま{" "}
          {mail.recipients.map((to, i) => (
            <span key={to}>
              {i > 0 && " または "}
              <a href={`mailto:${to}`} className="underline font-bold">
                {to}
              </a>
            </span>
          ))}{" "}
          までお送りください。
          {tel && (
            <>
              {" "}
              お電話でも承ります：
              <a href={`tel:${tel.replace(/[^0-9+]/g, "")}`} className="underline font-bold">
                {tel}
              </a>
            </>
          )}
        </p>

        <textarea
          readOnly
          rows={8}
          value={mail.body}
          aria-label="メールに貼り付ける内容"
          className="mt-3 w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-800"
        />

        <button
          type="button"
          onClick={() => setState("input")}
          className="mt-4 text-sm text-stone-600 underline"
        >
          入力画面に戻る
        </button>
      </div>
    );
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
          defaultValue={entered.shopName}
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
          defaultValue={entered.contactName}
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
          defaultValue={entered.email}
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
          defaultValue={entered.phone}
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
          defaultValue={entered.note}
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
