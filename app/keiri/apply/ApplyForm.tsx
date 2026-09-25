"use client";

import { useState } from "react";

import { KEIRI_APPLY_LIMITS, keiriApplyMailto } from "@/lib/keiri/apply";

/**
 * 経理パッケージの申し込みの入力欄。
 *
 * ★必ず入れてもらうのは3つだけ（お店の名前・お名前・メールアドレス）。
 *   電話番号とひとことは任意（欄は全部で5つ・required が付くのは3つ）。
 *   数え方は lib/keiri/offer.ts が正で、画面の文章もそこから作る（kp111）。
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

export default function ApplyForm({
  email,
  tel,
  paymentLine,
  afterApplyLine,
}: {
  email: string;
  tel?: string;
  /** お支払いの方法の1行。lib/keiri/payment.ts が唯一の正（画面に直書きしない・kp184） */
  paymentLine: string;
  /** 受け付けたあとの画面に出す、お支払いの方法の1行（同上） */
  afterApplyLine: string;
}) {
  const [state, setState] = useState<State>("input");
  const [errors, setErrors] = useState<string[]>([]);
  // ★受け付けはできたが、**こちら側の誰も気づけない**状態か（2026-09-24・B）。
  //   もとは「倉庫に控えが残ったか」だけを見ていた（2026-09-19・kp69）。
  //   ところが本番では、LINE の残り通数が尽きて知らせが飛ばず、
  //   控えは残るが鍵が壊れていて読み返せない（kp55）という重なりが起こりうる。
  //   そのとき「ありがとうございます」と出しながら、誰にも届いていない。
  //   なので「残ったか」ではなく「**気づけるか**」で出し分ける。
  //   既定は true（余計なお願いをしないため。古い受け口が何も返さないときも出さない）
  const [reachable, setReachable] = useState(true);
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
        saved?: boolean;
        reachable?: boolean;
      };
      if (res.ok && data.ok) {
        // 新しい受け口は reachable を返す。返さない（古い）ときは、
        // これまでどおり「控えが残ったか」で判断する
        setReachable(
          data.reachable !== undefined ? data.reachable : data.saved !== false,
        );
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
              {/*
                ★どちらの宛先を押しても、件名と中身が入った下書きが開くようにする（2026-09-20）。
                  素の mailto だと空の下書きが開き、店主が打ち直すことになる。
                  1つめ（表の宛先）には写し（CC）が付き、2つめは写し先そのものなので付けない。
              */}
              <a
                href={
                  keiriApplyMailto({
                    to,
                    cc: to === mail.to ? undefined : null,
                    ...entered,
                  }).url
                }
                className="underline font-bold"
              >
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
          {afterApplyLine}
          こちらから何かを差し引くことはありませんので、そのままお待ちください。
        </p>
        {/*
          ★お急ぎのご連絡は、素の宛先1つにしない（2026-09-20）。
            ここを押すのは「申し込んだのに返事が来ない」と思った人＝いちばん熱い相手。
            写し（CC）が付かないと、司令室が毎時間見ている受信箱に1通も届かず、
            催促に気づけないまま「申込0件」と書き続けることになる（kp72・kp109 と同じ穴）。
            表に出す文字（宛先そのもの）は変えていない。
        */}
        <p className="mt-3 text-sm text-stone-600">
          お急ぎのときは{" "}
          <a
            href={keiriApplyMailto({ to: email, kind: "hurry", ...entered }).url}
            className="underline font-bold"
          >
            {email}
          </a>{" "}
          までご連絡ください。
        </p>

        {!reachable && (
          <div className="mt-5 rounded-xl border border-stone-300 bg-white p-4">
            <p className="text-sm font-bold text-stone-900">
              お手すきのときで構いません：控えのメールを1通だけ
            </p>
            <p className="mt-2 text-sm text-stone-700 leading-relaxed">
              お申し込みは受け付けています。ただ、いまこちら側の受け取りの仕組みが
              一部止まっていて、この1件に気づくのが遅れるおそれがあります。
              念のため同じ内容のメールをいただけると確実です。
              下のボタンで、中身の入った下書きが開きます（打ち直しは要りません）。
              送らなくてもお申し込みは有効です。
            </p>
            <a
              href={keiriApplyMailto({ to: email, kind: "copy", ...entered }).url}
              className="mt-3 flex items-center justify-center w-full h-12 rounded-xl border border-amber-500 text-amber-700 font-bold hover:bg-amber-50 transition"
            >
              控えのメールを開く
            </a>
          </div>
        )}
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
        この画面ではお支払いは発生しません。{paymentLine}
        いただいた連絡先は、このご案内以外には使いません。
      </p>
    </form>
  );
}
