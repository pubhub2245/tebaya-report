"use client";

/**
 * 「じゅんだけの手続きが のこっています」の知らせ（2026-10-12・f1-4／f3-4／f5-4）。
 *
 * ■ 誰に出るか
 *   お申し込みの赤い知らせ（kp156）・今日の1軒の帯（kp145）と**まったく同じ印**を使います。
 *   ＝管理者パスワードを一度でも入れた端末（＝じゅんの端末）だけ。
 *   手羽屋のスタッフの端末には、最初から最後まで出ません
 *   （印が無ければ、窓口に聞きにも行きません）。
 *
 * ■ 何を出すか
 *   窓口（/api/keiri/setuptodo）が返す「のこり何件・何分・どの1枚をひらくか」だけ。
 *   鍵・合言葉・金額・お店の名前は1文字も出しません（窓口が返してきません）。
 *
 * ■ なぜ要るか
 *   仕上げに のこっている3つ（金庫が合うか・お店ごとに分ける・2軒目を通す）は、
 *   どれも じゅんの一度きりの手続きで止まっています。その一覧は
 *   経理の画面（/keiri）のいちばん上に出ていますが、じゅんが毎日ひらくのは
 *   **ホームと管理者ページ**です。貼り紙（2分）は 10/3 から 10日 止まったままでした。
 *
 * ■ 日報・集計には触っていません
 *   窓口に1回聞くだけで、日報のデータは1行も読み書きしません。
 */

import { useEffect, useState } from "react";

import { readOwnerDevice } from "@/lib/keiri/outreach";
import {
  SETUP_NOTICE_NOTE,
  readSetupTodoSummary,
  remainingItems,
  setupNoticeHeadline,
  shouldShowSetupNotice,
  type SetupNoticeSummary,
} from "@/lib/keiri/setupNotice";

export default function OwnerSetupTodoNotice() {
  const [summary, setSummary] = useState<SetupNoticeSummary | null>(null);
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    // ★印の付いていない端末（スタッフ）では、窓口に聞きにも行かない
    const isOwner = readOwnerDevice();
    setOwner(isOwner);
    if (!isOwner) return;

    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/keiri/setuptodo", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as unknown;
        if (alive) setSummary(readSetupTodoSummary(json));
      } catch {
        // 聞けなかっただけ。何も出さない（嘘の安心も嘘の催促も出さない）
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!shouldShowSetupNotice({ ownerDevice: owner, summary })) return null;

  const items = remainingItems(summary);
  const [first, ...rest] = items;

  return (
    <section className="mb-5 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 space-y-2">
      <p className="text-base font-bold text-amber-900 leading-snug">
        🙋 {setupNoticeHeadline(summary)}
      </p>

      {first ? (
        <a
          href={first.href}
          className="block rounded-xl bg-amber-600 px-4 py-3 text-white font-bold leading-snug"
        >
          {first.title}（{first.minutes}）
          <span className="block text-xs font-normal mt-1">{first.benefit}</span>
        </a>
      ) : null}

      {first?.detail ? (
        <p className="text-xs text-amber-800 leading-relaxed">いま：{first.detail}</p>
      ) : null}

      {/* ★2026-10-28：2件目から下も「何が前に進むか」を1行 添えます（f3-4）。
             題名だけだと、どれが仕上げの不合格を閉める1分なのか分かりません
             （実際に『鍵を貼り直す』は、いちばん大事な効き目が1文字も出ていませんでした）。 */}
      {rest.length > 0 ? (
        <ul className="space-y-2">
          {rest.map((i) => (
            <li key={i.id} className="text-sm leading-snug">
              <a href={i.href} className="font-bold text-amber-900 underline">
                {i.title}（{i.minutes}）
              </a>
              {i.benefit ? (
                <span className="block text-xs font-normal text-amber-800 leading-relaxed">
                  {i.benefit}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-amber-800 leading-relaxed">{SETUP_NOTICE_NOTE}</p>
    </section>
  );
}
