"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 「過去のレシートを読み直す」パネル（管理者ページ用）。
 *
 * ■ これは何をするボタンか
 *   昔の経費は、レシート写真の読み取りが**税抜（本体価格）のまま**入っていることがあります。
 *   このボタンを押すと、写真が残っている行だけ**写真をもう一度読み直して**、
 *   レシートに書かれている税込の金額に直します。
 *
 *   レシートを財布から出して、もう一度見比べる、というイメージです。
 *
 * ■ 安全のしくみ
 *   - 書き換える前に必ず控えを残します（残せなければ実行しません）。
 *   - **写真がある行だけ**が対象です。写真の無い行には一切触りません。
 *   - 読み直した品物の名前がその行と対応づかないときは、直さずに「要確認」に出します。
 *   - 増える方向で、増え方が消費税で説明できる範囲（1.12倍まで）のときだけ直します。
 *   - すでに直した行には触れません。何度押しても二重に増えません。
 *
 * ■ 費用について
 *   写真1枚ごとに読み取りの費用がかかります（全部で約0.5ドルの見込み）。
 *   下の「残り」の表示（下見）は読み取りをしないので**無料**です。
 */

const REQUIRED = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";

type Preview = {
  ok: boolean;
  remainingPhotos: number;
  remainingReports: number;
  perRun: number;
  error?: string;
};

type RunResult = {
  ok: boolean;
  fixedPhotos: number;
  fixedDiff: number;
  fixed: { date: string; description: string; from: number; to: number }[];
  needsCheck: { date: string; description: string; amount: number; reason: string }[];
  remainingPhotos: number;
  errors: string[];
  error?: string;
};

const yen = (n: number) => `${n.toLocaleString()}円`;

export default function ReceiptReocrPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixed, setFixed] = useState<RunResult["fixed"]>([]);
  const [needsCheck, setNeedsCheck] = useState<RunResult["needsCheck"]>([]);

  /** 下見（残りの枚数を見るだけ。読み取りをしないので費用はかからない） */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reocr-receipts", {
        headers: { authorization: `Bearer ${REQUIRED}` },
      });
      const json = (await res.json()) as Preview;
      if (!res.ok) throw new Error(json.error || "状況を取得できませんでした");
      setPreview(json);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** 実行。1回で数枚ずつ進むので、残りが無くなるまで繰り返す */
  const run = async () => {
    if (
      !window.confirm(
        "レシート写真を読み直します。\n" +
          "写真1枚ごとに読み取りの費用がかかります（全部で約0.5ドルの見込み）。\n" +
          "書き換える前に控えを残します。実行してよろしいですか？",
      )
    )
      return;

    setRunning(true);
    setMsg(null);
    setError(null);
    const allFixed: RunResult["fixed"] = [];
    const allChecks: RunResult["needsCheck"] = [];
    try {
      // 念のための上限。無限に回り続けないようにする
      for (let round = 0; round < 20; round++) {
        const res = await fetch("/api/admin/reocr-receipts", {
          method: "POST",
          headers: { authorization: `Bearer ${REQUIRED}`, "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = (await res.json()) as RunResult;
        if (!res.ok) throw new Error(json.error || "読み直しに失敗しました");

        allFixed.push(...(json.fixed ?? []));
        allChecks.push(...(json.needsCheck ?? []));
        setFixed([...allFixed]);
        setNeedsCheck([...allChecks]);
        setMsg(
          `読み直し中… ${allFixed.length}件を修正（残り写真${json.remainingPhotos}枚）`,
        );

        if (json.errors?.length) throw new Error(json.errors.join(" / "));
        if (json.remainingPhotos === 0) break;
      }
      const diff = allFixed.reduce((s, f) => s + (f.to - f.from), 0);
      setMsg(`✅ 完了：${allFixed.length}件を税込に直しました（合計 +${yen(diff)}）`);
    } catch (e: any) {
      setError(e?.message || String(e));
      setMsg(
        allFixed.length > 0
          ? `途中まで完了：${allFixed.length}件。もう一度押すと続きから進みます`
          : null,
      );
    } finally {
      setRunning(false);
      load();
    }
  };

  const done = !!preview && preview.remainingPhotos === 0;

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-brand-dark">🧾 過去のレシートを読み直す</h2>
        <button
          onClick={load}
          className="text-xs text-stone-500 underline hover:text-stone-700"
        >
          更新
        </button>
      </div>

      <p className="text-xs text-stone-500 leading-relaxed">
        昔の経費は、レシートの読み取りが<b>税抜（本体価格）のまま</b>入っていることがあります。
        写真が残っている行だけ、写真をもう一度読み直して<b>税込の金額に直します</b>。
        写真の無い行には一切触りません。
      </p>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-2 py-1 leading-relaxed">
          ❌ {error}
        </p>
      )}

      {preview && !loading && (
        <>
          {done ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-2 py-1">
              ✅ 読み直す写真はもうありません
            </p>
          ) : (
            <div className="text-sm text-stone-700 bg-stone-50 rounded px-3 py-2 space-y-0.5">
              <div>
                読み直し待ち：<b>写真{preview.remainingPhotos}枚</b> ／ 日報
                {preview.remainingReports}件
              </div>
              <div className="text-[11px] text-amber-700">
                ⚠ 実行すると写真1枚ごとに読み取りの費用がかかります（全部で約0.5ドルの見込み）。
                この「残り」の表示は読み取りをしないので無料です。
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={run}
              disabled={running || done}
              className="btn-secondary text-sm"
            >
              {running ? "読み直し中…" : "🧾 レシートを読み直す"}
            </button>
            {msg && <span className="text-xs text-stone-600">{msg}</span>}
          </div>
        </>
      )}

      {fixed.length > 0 && (
        <div className="text-xs text-stone-700 bg-emerald-50 rounded px-3 py-2 space-y-0.5 max-h-60 overflow-auto">
          <div className="font-bold text-emerald-800">直した行（{fixed.length}件）</div>
          {fixed.map((f, i) => (
            <div key={i}>
              {f.date}　{f.description}：{yen(f.from)} → <b>{yen(f.to)}</b>
            </div>
          ))}
        </div>
      )}

      {needsCheck.length > 0 && (
        <div className="text-xs text-stone-700 bg-amber-50 rounded px-3 py-2 space-y-0.5 max-h-60 overflow-auto">
          <div className="font-bold text-amber-800">
            直さなかった行（{needsCheck.length}件）— 人が確かめてください
          </div>
          {needsCheck.map((c, i) => (
            <div key={i}>
              {c.date}　{c.description}（{yen(c.amount)}）：{c.reason}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-stone-400 leading-relaxed">
        書き換える前に控えを自動で残します（残せなかったときは実行しません）。
        すでに直した行には触れないので、何度押しても二重に増えません。
        途中で止まっても、もう一度押せば続きから進みます。
      </p>
    </section>
  );
}
