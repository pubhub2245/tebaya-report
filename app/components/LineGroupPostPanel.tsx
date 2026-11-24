"use client";

/**
 * 管理者ページ：Bot「手羽屋業務連絡」が入っているLINEグループを選んで、お知らせを1通送る（2026-11-22）。
 * 送る前に、送り先と文章をもう一度見せてから送る（押し間違いで送らないため）。
 */

import { useCallback, useEffect, useState } from "react";

const REQUIRED = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";

type Group = { groupId: string; name: string | null; memberCount: number | null; joinedAt: string | null; isDaily: boolean };
type Bot = "staff" | "shop";
const BOT_LABEL: Record<Bot, string> = { staff: "手羽屋業務連絡", shop: "手羽屋 ばあちゃんち" };

export default function LineGroupPostPanel() {
  const [bot, setBot] = useState<Bot>("shop");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [groupId, setGroupId] = useState("");
  const [text, setText] = useState("");
  const [step, setStep] = useState<"edit" | "confirm" | "sending" | "done">("edit");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setGroups(null);
    setGroupId("");
    setRemaining(null);
    try {
      const res = await fetch(`/api/admin/line-groups?bot=${bot}`, { headers: { authorization: `Bearer ${REQUIRED}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "グループを読めませんでした");
      if (!json.tokenSet) throw new Error(`「${BOT_LABEL[bot]}」の合鍵がまだ設定されていません`);
      setGroups(json.groups);
      setRemaining(json.remaining);
    } catch (e: any) {
      setError(e.message);
    }
  }, [bot]);

  useEffect(() => {
    load();
  }, [load]);

  const target = groups?.find((g) => g.groupId === groupId);
  // グループへの1通は、グループの人数ぶん数える（LINEの決まり）
  const cost = target?.memberCount ?? null;
  const notEnough = remaining !== null && cost !== null && cost > remaining;

  const send = async () => {
    setStep("sending");
    setError(null);
    try {
      const res = await fetch("/api/admin/line-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${REQUIRED}` },
        body: JSON.stringify({ bot, groupId, text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "送れませんでした");
      setStep("done");
    } catch (e: any) {
      setError(e.message);
      setStep("confirm");
    }
  };

  return (
    <section className="card space-y-3" aria-label="LINEのグループに送る">
      <h2 className="text-lg font-bold">📣 LINEのグループに送る</h2>
      <p className="text-xs text-stone-500">Botが入っているグループに、お知らせを1通送ります。送れる通数はBotごとに別です。</p>
      <div className="flex gap-2" role="group" aria-label="どのBotで送るか">
        {(["shop", "staff"] as Bot[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => { setBot(b); setStep("edit"); }}
            disabled={step === "sending"}
            className={`flex-1 h-11 rounded-lg border text-sm font-bold ${bot === b ? "bg-stone-800 text-white border-stone-800" : "border-stone-300"}`}
          >
            {BOT_LABEL[b]}
          </button>
        ))}
      </div>
      {groups && (
        <p className="text-sm">
          今月あと送れる通数：<b>{remaining === null ? "上限なし／読めません" : `${remaining.toLocaleString()}通`}</b>
        </p>
      )}
      {groups && groups.length === 0 && (
        <p className="text-sm text-stone-600">このBotが入っているグループはまだありません。LINEでグループに招待すると、ここに出ます。</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!groups && !error && <p className="text-sm text-stone-500">読み込み中…</p>}
      {groups && step === "done" && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-green-700">✅「{target?.name ?? "グループ"}」に送りました。</p>
          <button type="button" className="text-sm underline" onClick={() => { setText(""); setStep("edit"); }}>
            続けて送る
          </button>
        </div>
      )}
      {groups && step !== "done" && (
        <>
          <select
            className="w-full h-11 rounded-lg border border-stone-300 px-2"
            value={groupId}
            onChange={(e) => { setGroupId(e.target.value); setStep("edit"); }}
            disabled={step !== "edit"}
            aria-label="送り先のグループ"
          >
            <option value="">送り先のグループを選ぶ</option>
            {groups.map((g) => (
              <option key={g.groupId} value={g.groupId}>
                {g.name ?? "（名前を読めないグループ）"}
                {g.memberCount !== null ? `（${g.memberCount}人）` : ""}
                {g.isDaily ? "（日報の送り先）" : ""}
              </option>
            ))}
          </select>
          <textarea
            className="w-full min-h-40 rounded-lg border border-stone-300 p-2 text-sm"
            value={text}
            onChange={(e) => { setText(e.target.value); setStep("edit"); }}
            disabled={step !== "edit"}
            placeholder="送る文章"
            aria-label="送る文章"
          />
          {step === "edit" && (
            <button
              type="button"
              disabled={!groupId || !text.trim()}
              onClick={() => setStep("confirm")}
              className="w-full h-11 rounded-lg bg-orange-500 text-white font-bold disabled:opacity-50"
            >
              確認する
            </button>
          )}
          {(step === "confirm" || step === "sending") && (
            <div className="space-y-2 rounded-lg bg-amber-50 p-3">
              <p className="text-sm font-bold">
                「{BOT_LABEL[bot]}」から「{target?.name ?? "グループ"}」に、上の文章を送ります。よろしいですか？
              </p>
              {cost !== null && <p className="text-xs text-stone-600">使う通数：{cost}通（グループの人数ぶん）</p>}
              {notEnough && <p className="text-sm font-bold text-red-600">今月の残りの通数が足りません。送ると失敗します。</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={send}
                  disabled={step === "sending" || notEnough}
                  className="flex-1 h-11 rounded-lg bg-green-600 text-white font-bold disabled:opacity-50"
                >
                  {step === "sending" ? "送っています…" : "送る"}
                </button>
                <button type="button" onClick={() => setStep("edit")} className="h-11 px-4 rounded-lg border border-stone-300">
                  直す
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
