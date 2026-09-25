"use client";

/**
 * ホームのいちばん上に出る「今日、1軒だけ送りませんか」の帯（kp145）。
 *
 * ■ 誰に出るか
 *   **管理者パスワードを一度でも入れた端末にだけ**出ます（＝じゅんの端末）。
 *   手羽屋のスタッフの端末には、最初から最後まで出ません。
 *   このアプリにはログインが無いので、じゅんだけが持っているもの＝管理者パスワードを
 *   目印にしています（印を付けるのは AdminGate と lib/useAdminAuth.ts の
 *   「手羽屋の合言葉が合った」ときだけ。申し込んだお店の合言葉では付きません）。
 *
 * ■ 何をするか
 *   ・**今日の1軒を、こちらで1つだけ名指しする**（kp154）。選ぶのに迷わないため
 *   ・［LINEで送る］で、文を持ったまま LINE の送り先を選ぶ画面が開く
 *   ・［送りました］を押すと、その1軒に印が付き、次の1軒が出てくる
 *   ・別の1軒にしたいとき・印を直したいときは、たたんである8軒の一覧から押す
 *   ・8軒ぜんぶに印が付いたら、帯はもう出ない
 *   ・「今日は出さない」で、その日だけ閉じられる
 *
 * ■ 出さないもの
 *   連絡先（LINEのID・メールアドレス）と、値段。理由は lib/keiri/outreach.ts に。
 *
 * ■ お店の呼び名を取り込んでよいのは、この帯だけです（kp172）
 *   この帯は「じゅんの端末（管理者パスワードを入れた端末）」にしか出ないので、
 *   呼び名を出してよい唯一の場所です。呼び名は lib/keiri/outreachShopLabels.ts にあり、
 *   **合言葉の要らない住所（/keiri/send）からは取り込みません。**
 *
 * ■ 日報・集計には触っていません
 *   この帯は日報のデータを1行も読み書きしません。控えはこの端末の中だけです。
 */

import { useEffect, useState } from "react";
import {
  OUTREACH_LINE_SHARE_URL,
  OUTREACH_MESSAGE,
  OUTREACH_SENT_KEY,
  OUTREACH_SNOOZE_KEY,
  OWNER_MARK_PARAM,
  clearOwnerDevice,
  markOwnerDevice,
  ownerMarkFromQuery,
  parseSent,
  readOwnerDevice,
  serializeSent,
  shouldShowNudge,
  todayKey,
} from "@/lib/keiri/outreach";
// ★呼び名はこのファイルからだけ取り込む（kp172）。/keiri/send からは取り込まない。
import { OUTREACH_SHOPS, nextShop } from "@/lib/keiri/outreachShopLabels";

export default function OwnerOutreachNudge() {
  /** ブラウザの控えをまだ読んでいないあいだは true（そのあいだは何も出さない） */
  const [checking, setChecking] = useState(true);
  const [owner, setOwner] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [snoozedOn, setSnoozedOn] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // ★1タップのリンク（kp147）。`?owner=1` で来たら、この端末に印を付ける。
    //   印が付くのは「合言葉を入れたとき」だけだったので、管理者ページを開かない
    //   じゅんの端末には印が永久に付かず、帯が一度も出なかった。
    //   合言葉の判定は1文字も変えていない（管理者ページに入れるようにはならない）。
    try {
      const url = new URL(window.location.href);
      const mark = ownerMarkFromQuery(url.searchParams.get(OWNER_MARK_PARAM));
      if (mark === "mark") markOwnerDevice();
      if (mark === "unmark") clearOwnerDevice();
      if (mark !== null) {
        // 住所の欄にリンクの印を残さない（ほかの項目はそのまま）
        url.searchParams.delete(OWNER_MARK_PARAM);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {}

    setOwner(readOwnerDevice());
    try {
      setSent(parseSent(localStorage.getItem(OUTREACH_SENT_KEY)));
      setSnoozedOn(localStorage.getItem(OUTREACH_SNOOZE_KEY));
    } catch {}
    setChecking(false);
  }, []);

  const today = todayKey();
  if (checking) return null;
  if (!shouldShowNudge({ ownerDevice: owner, sent, snoozedOn, today })) return null;

  const toggle = (id: string) => {
    const next = sent.includes(id) ? sent.filter((s) => s !== id) : [...sent, id];
    setSent(next);
    try {
      localStorage.setItem(OUTREACH_SENT_KEY, serializeSent(next));
    } catch {}
  };

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(OUTREACH_MESSAGE);
      ok = true;
    } catch {
      // クリップボードが使えない端末のための控え（古いやり方で写す）
      try {
        const ta = document.createElement("textarea");
        ta.value = OUTREACH_MESSAGE;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    }
    setCopied(ok);
    if (!ok) window.prompt("下の文をコピーしてください", OUTREACH_MESSAGE);
  };

  const snooze = () => {
    setSnoozedOn(today);
    try {
      localStorage.setItem(OUTREACH_SNOOZE_KEY, today);
    } catch {}
  };

  const done = sent.length;
  /** 今日の1軒（まだ送っていない中の、いちばん上の1軒） */
  const today1 = nextShop(sent);

  return (
    <section className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-3 space-y-3">
      <p className="text-sm font-bold text-orange-900 leading-snug">
        今日、出店先で会った店主に1軒だけ送りませんか
      </p>
      <p className="text-xs text-orange-800 leading-relaxed">
        経理パッケージのご案内です。文はできています。1軒10秒、1日1軒で十分です。
      </p>

      {/*
        ★今日の1軒（kp154）。8軒から選ぶのをこちらで済ませ、1軒だけ名指しする。
        じゅんがやるのは「この1軒に送る／別の1軒にする」の2択だけ。
      */}
      {today1 ? (
        <div className="rounded-xl bg-white border border-orange-200 px-3 py-2">
          <p className="text-xs text-orange-700">今日の1軒</p>
          <p className="text-base font-bold text-orange-900 leading-snug">{today1.label}</p>
          {today1.note ? (
            <p className="text-xs text-orange-800 leading-relaxed">{today1.note}</p>
          ) : null}
        </div>
      ) : null}

      {/*
        ★まずこれ（kp151）。LINE の「送り先を選ぶ」画面が、文を持ったまま開きます。
        じゅんがやるのは相手を選んで送るだけ。勝手には送られません。
      */}
      <a
        href={OUTREACH_LINE_SHARE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full h-12 items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold shadow-sm transition"
      >
        LINEで送る（相手を選ぶだけ）
      </a>
      <p className="text-xs text-orange-800 leading-relaxed -mt-1">
        文は入った状態で開きます。送るのはご自分で押したときだけです。
      </p>

      <button
        type="button"
        onClick={copy}
        className="w-full h-11 rounded-xl bg-white border border-orange-300 text-orange-900 font-bold hover:bg-orange-100 active:bg-orange-200 transition"
      >
        {copied ? "コピーしました（LINEに貼ってください）" : "うまく開かないときは文をコピー"}
      </button>

      {/* 送ったら押す。押した1軒に印が付き、次の1軒がひとりでに出てくる（kp154） */}
      {today1 ? (
        <button
          type="button"
          onClick={() => toggle(today1.id)}
          className="w-full h-11 rounded-xl bg-white border border-orange-400 text-orange-900 font-bold hover:bg-orange-100 active:bg-orange-200 transition"
        >
          送りました（{today1.label}）
        </button>
      ) : null}

      <details className="rounded-xl bg-white/60 border border-orange-200 px-3 py-2">
        <summary className="text-xs text-orange-900 font-bold cursor-pointer min-h-11 flex items-center">
          別の1軒にする・送った印を直す（{done} / {OUTREACH_SHOPS.length} 軒）
        </summary>
        <div className="flex flex-wrap gap-2 pt-2">
          {OUTREACH_SHOPS.map((shop) => {
            const isDone = sent.includes(shop.id);
            return (
              <button
                key={shop.id}
                type="button"
                onClick={() => toggle(shop.id)}
                aria-pressed={isDone}
                className={`min-h-11 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                  isDone
                    ? "bg-orange-600 border-orange-600 text-white"
                    : "bg-white border-orange-300 text-orange-900 hover:bg-orange-100"
                }`}
              >
                {isDone ? "✓ " : ""}
                {shop.label}
                {shop.note ? (
                  <span className="block font-normal opacity-80">{shop.note}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </details>

      <button
        type="button"
        onClick={snooze}
        className="block w-full text-center text-xs text-orange-700 underline hover:text-orange-900 py-2"
      >
        今日は出さない
      </button>
    </section>
  );
}
