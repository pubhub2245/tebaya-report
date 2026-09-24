"use client";

/**
 * 「お申し込みが入っています」の赤い知らせ（kp156）。
 *
 * ■ 誰に出るか
 *   既定では「今日1軒だけ送りませんか」の帯（kp145）と**まったく同じ印**を使います。
 *   ＝管理者パスワードを一度でも入れた端末（＝じゅんの端末）だけ。
 *   手羽屋のスタッフの端末には、最初から最後まで出ません。
 *
 *   例外は1か所だけです（kp165）。「送る1枚」（/keiri/send）では
 *   `requireOwnerDevice={false}` を渡し、**印を見ずに**出します。
 *   理由：知らせが出る条件が「印のある端末」だけだと、
 *   その印を付ける1タップ（kp150）が押されていない間は、
 *   お申し込みが入っても**どこにも出ません**。
 *   そして いま じゅんに渡している道は、印の要らない /keiri/send の1本です。
 *   ＝送る入口だけ印から外して、知らせは印の中に置いたままにすると、
 *   「送ったのに、返事が来たことに気づけない」がそのまま起きます。
 *   出すのは**件数と時刻だけ**なので、誰が開いても連絡先は渡りません。
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
 *   印の付いていない端末では、その1回の問い合わせもしません
 *   （印を見ない「送る1枚」だけは、件数を1回だけ聞きます）。
 */

import { useEffect, useState } from "react";

import {
  APPLICATION_ALERT_OPEN_NOTE,
  applicationAlertHeadline,
  applicationAlertWhen,
  readApplicationCountSummary,
  shouldShowApplicationAlert,
  type ApplicationCountSummary,
} from "@/lib/keiri/applicationAlert";
import { readOwnerDevice } from "@/lib/keiri/outreach";

type Props = {
  /**
   * 端末の印（kp150）を条件にするか。既定は true。
   * false にしてよいのは「送る1枚」（/keiri/send）だけ（kp165）。
   */
  requireOwnerDevice?: boolean;
};

export default function OwnerApplicationAlert({ requireOwnerDevice = true }: Props = {}) {
  const [summary, setSummary] = useState<ApplicationCountSummary | null>(null);
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    // ★印の付いていない端末（スタッフ）では、数を聞きにも行かない
    const isOwner = readOwnerDevice();
    setOwner(isOwner);
    if (requireOwnerDevice && !isOwner) return;

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
  }, [requireOwnerDevice]);

  if (!shouldShowApplicationAlert({ ownerDevice: owner, summary, requireOwnerDevice }))
    return null;

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
        {requireOwnerDevice
          ? "お店の名前とご連絡先は、Supabase の Table Editor で keiri_applications を開くと見られます（この画面には出しません）。折り返しのご連絡だけお願いします。お支払いのリンクは貼らないでください。"
          : APPLICATION_ALERT_OPEN_NOTE}
      </p>
    </section>
  );
}
