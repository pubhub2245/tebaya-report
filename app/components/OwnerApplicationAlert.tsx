"use client";

/**
 * 「お申し込みが入っています」の赤い知らせ（kp156）。
 *
 * ■ 誰に出るか
 *   「今日1軒だけ送りませんか」の帯（kp145）と**まったく同じ印**を使います。
 *   ＝管理者パスワードを一度でも入れた端末（＝じゅんの端末）だけ。
 *   手羽屋のスタッフの端末には、最初から最後まで出ません。
 *
 * ■ 何を出すか
 *   まだ手当てしていないお申し込みの**件数と、入った時刻**だけ。
 *   お店の名前・お名前・メール・電話は1文字も出しません（窓口が返してきません）。
 *
 * ■ なぜ要るか
 *   お申し込みに人が気づける道は、スタッフのLINEへの知らせしかありません。
 *   その LINE は今月あと5通で、毎日の日報の知らせと同じ通数を使います。
 *   使い切ると、行は倉庫に残るのに誰も気づかないまま置かれます。
 *
 * ■ 日報・集計には触っていません
 *   数を1回聞くだけで、日報のデータは1行も読み書きしません。
 *   印の付いていない端末では、その1回の問い合わせもしません。
 */

import { useEffect, useState } from "react";

import {
  applicationAlertHeadline,
  applicationAlertWhen,
  readApplicationCountSummary,
  shouldShowApplicationAlert,
  type ApplicationCountSummary,
} from "@/lib/keiri/applicationAlert";
import { readOwnerDevice } from "@/lib/keiri/outreach";

export default function OwnerApplicationAlert() {
  const [summary, setSummary] = useState<ApplicationCountSummary | null>(null);
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    // ★印の付いていない端末（スタッフ）では、数を聞きにも行かない
    const isOwner = readOwnerDevice();
    setOwner(isOwner);
    if (!isOwner) return;

    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/keiri/applications/count", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as unknown;
        if (alive) setSummary(readApplicationCountSummary(json));
      } catch {
        // 聞けなかっただけ。何も出さない（嘘の安心も嘘の警報も出さない）
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!shouldShowApplicationAlert({ ownerDevice: owner, summary })) return null;

  const pending = summary?.pending ?? 0;
  const when = applicationAlertWhen(summary?.latestAt ?? null);

  return (
    <section className="mb-5 rounded-2xl border-2 border-red-400 bg-red-50 p-3 space-y-2">
      <p className="text-base font-bold text-red-900 leading-snug">
        ★{applicationAlertHeadline(pending)}
      </p>
      {when ? (
        <p className="text-xs text-red-800 leading-relaxed">
          いちばん新しいのは {when}（日本時間）に入りました。
        </p>
      ) : null}
      <p className="text-xs text-red-800 leading-relaxed">
        お店の名前とご連絡先は、Supabase の Table Editor で keiri_applications
        を開くと見られます（この画面には出しません）。折り返しのご連絡だけお願いします。お支払いのリンクは貼らないでください。
      </p>
    </section>
  );
}
