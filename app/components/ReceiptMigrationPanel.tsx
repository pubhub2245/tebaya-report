"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * レシート写真の引っ越しパネル（管理者ページ用）。
 *
 * ■ これは何をするボタンか
 *   昔の日報には、レシート写真そのものが日報の中に貼り付けられています
 *   （写真つき12件で18MB）。そのため日報を開くのが重く、毎日の控えも膨らみます。
 *   このボタンを押すと、写真を「写真専用の置き場」に移し、
 *   日報には「置き場の住所」だけを残します。
 *
 *   アルバムに写真を糊で貼っていたのをやめて、
 *   「写真は3番の引き出し」とメモだけ書く、というイメージです。
 *
 * ■ 安全のしくみ
 *   - 書き換える前に必ず「引っ越し前の控え」を残します（残せなければ中止）。
 *   - 写真は消しません。置き場に移すだけです。
 *   - 何度押しても、すでに移した写真には触れません。
 *   - 途中で止まっても、もう一度押せば続きから進みます。
 */

const REQUIRED = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";

type MigrationResult = {
  ok: boolean;
  dryRun: boolean;
  targetReports: number;
  targetPhotos: number;
  movedPhotos: number;
  failedPhotos: number;
  updatedReports: number;
  targetBytes: number;
  remainingReports: number;
  backupSaved: boolean;
  errors: string[];
  error?: string;
};

function mb(bytes: number): string {
  if (!bytes) return "0MB";
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function ReceiptMigrationPanel() {
  const [status, setStatus] = useState<MigrationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 下見（何件残っているかを見るだけ。何も書き換えない） */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/migrate-receipts", {
        headers: { authorization: `Bearer ${REQUIRED}` },
      });
      const json = (await res.json()) as MigrationResult;
      if (!res.ok) throw new Error(json.error || "状況を取得できませんでした");
      setStatus(json);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** 実行。1回で5件ずつ進むので、残りが無くなるまで繰り返す */
  const run = async () => {
    setRunning(true);
    setMsg(null);
    setError(null);
    let movedPhotos = 0;
    let updatedReports = 0;
    try {
      // 念のための上限。無限に回り続けないようにする
      for (let round = 0; round < 30; round++) {
        const res = await fetch("/api/admin/migrate-receipts", {
          method: "POST",
          headers: { authorization: `Bearer ${REQUIRED}` },
        });
        const json = (await res.json()) as MigrationResult;
        if (!res.ok) throw new Error(json.error || "引っ越しに失敗しました");

        movedPhotos += json.movedPhotos;
        updatedReports += json.updatedReports;
        setMsg(`引っ越し中… ${updatedReports}件ぶん完了（写真${movedPhotos}枚）`);

        if (json.errors?.length) {
          throw new Error(json.errors.join(" / "));
        }
        // これ以上進まない（対象なし、または今回1件も進まなかった）なら終了
        if (json.targetReports === 0 || json.updatedReports === 0) break;
      }
      setMsg(`✅ 完了：日報${updatedReports}件・写真${movedPhotos}枚を置き場へ移しました`);
    } catch (e: any) {
      setError(e?.message || String(e));
      setMsg(
        movedPhotos > 0
          ? `途中まで完了：日報${updatedReports}件・写真${movedPhotos}枚。もう一度押すと続きから進みます`
          : null,
      );
    } finally {
      setRunning(false);
      load();
    }
  };

  const done = !!status && status.targetReports === 0;

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-brand-dark">🖼 レシート写真の置き場</h2>
        <button
          onClick={load}
          className="text-xs text-stone-500 underline hover:text-stone-700"
        >
          更新
        </button>
      </div>

      <p className="text-xs text-stone-500 leading-relaxed">
        昔の日報は、レシート写真そのものが日報の中に貼り付いています。
        写真を専用の置き場へ移すと、日報が軽くなり、毎日の控えも小さくなります。
        <b>写真は消えません。置き場所が変わるだけです。</b>
      </p>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-2 py-1 leading-relaxed">
          ❌ {error}
        </p>
      )}

      {status && !loading && (
        <>
          {done ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-2 py-1">
              ✅ 引っ越しの必要な写真はありません
            </p>
          ) : (
            <div className="text-sm text-stone-700 bg-stone-50 rounded px-3 py-2 space-y-0.5">
              <div>
                引っ越し待ち：<b>日報{status.targetReports}件</b> ／ 写真
                {status.targetPhotos}枚 ／ 約{mb(status.targetBytes)}
              </div>
              <div className="text-[11px] text-stone-500">
                実行すると、この約{mb(status.targetBytes)}ぶんが日報から外れて置き場に移ります。
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={run}
              disabled={running || done}
              className="btn-secondary text-sm"
            >
              {running ? "引っ越し中…" : "🖼 写真を置き場へ移す"}
            </button>
            {msg && <span className="text-xs text-stone-600">{msg}</span>}
          </div>
        </>
      )}

      <p className="text-[11px] text-stone-400 leading-relaxed">
        書き換える前に「引っ越し前の控え」を自動で残します（残せなかったときは実行しません）。
        途中で止まっても、もう一度押せば続きから進みます。
      </p>
    </section>
  );
}
