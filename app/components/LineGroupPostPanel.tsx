"use client";

/**
 * 管理者ページ：Bot「手羽屋業務連絡」が入っているLINEグループを選んで、お知らせを1通送る（2026-11-22）。
 * 送る前に、送り先と文章をもう一度見せてから送る（押し間違いで送らないため）。
 */

import { useCallback, useEffect, useState } from "react";

const REQUIRED = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";

type Group = { groupId: string; name: string | null; joinedAt: string | null; isDaily: boolean };

export default function LineGroupPostPanel() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [groupId, setGroupId] = useState("");
  const [text, setText] = useState("");
  const [step, setStep] = useState<"edit" | "confirm" | "sending" | "done">("edit");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/line-groups", { headers: { authorization: `Bearer ${REQUIRED}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "グループを読めませんでした");
      setGroups(json.groups);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const target = groups?.find((g) => g.groupId === groupId);

  const send = async () => {
    setStep("sending");
    setError(null);
    try {
      const res = await fetch("/api/admin/line-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${REQUIRED}` },
        body: JSON.stringify({ groupId, text }),
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
      <p className="text-xs text-stone-500">Bot「手羽屋業務連絡」が入っているグループに、お知らせを1通送ります。</p>
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
              <p className="text-sm font-bold">「{target?.name ?? "グループ"}」に、上の文章を送ります。よろしいですか？</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={send}
                  disabled={step === "sending"}
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
