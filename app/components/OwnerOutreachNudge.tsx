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
 *   ・［LINEの文をコピー］を押すと、送る4行がそのまま手元に入る（相手の名前だけ空欄）
 *   ・送り先8軒を並べ、押すと「送った」印が付く（印はこの端末に残る）
 *   ・8軒ぜんぶに印が付いたら、帯はもう出ない
 *   ・「今日は出さない」で、その日だけ閉じられる
 *
 * ■ 出さないもの
 *   連絡先（LINEのID・メールアドレス）と、値段。理由は lib/keiri/outreach.ts に。
 *
 * ■ 日報・集計には触っていません
 *   この帯は日報のデータを1行も読み書きしません。控えはこの端末の中だけです。
 */

import { useEffect, useState } from "react";
import {
  OUTREACH_MESSAGE,
  OUTREACH_SENT_KEY,
  OUTREACH_SHOPS,
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

  return (
    <section className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-3 space-y-3">
      <p className="text-sm font-bold text-orange-900 leading-snug">
        今日、出店先で会った店主に1軒だけ送りませんか
      </p>
      <p className="text-xs text-orange-800 leading-relaxed">
        経理パッケージのご案内です。文はできています。1軒10秒、1日1軒で十分です。
      </p>

      <button
        type="button"
        onClick={copy}
        className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold shadow-sm transition"
      >
        {copied ? "コピーしました（LINEに貼ってください）" : "LINEの文をコピー"}
      </button>

      <div>
        <p className="text-xs text-orange-800 mb-1">
          送ったら押してください（{done} / {OUTREACH_SHOPS.length} 軒）
        </p>
        <div className="flex flex-wrap gap-2">
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
      </div>

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
