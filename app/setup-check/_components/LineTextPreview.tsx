"use client";

import { useState } from "react";
import Link from "next/link";

type LineTextPreviewProps = {
  text: string;
  onReset: () => void;
  recordId?: string;
  alreadyPosted?: boolean;
  onPostSuccess?: () => void;
};

export default function LineTextPreview({
  text,
  onReset,
  recordId,
  alreadyPosted,
  onPostSuccess,
}: LineTextPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(alreadyPosted ?? false);
  const [postError, setPostError] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      alert(
        "クリップボードにコピーできませんでした。手動で選択してコピーしてください。",
      );
    }
  };

  const handlePostToLine = async () => {
    if (!recordId) {
      setPostError("レコードIDがありません");
      return;
    }
    if (!confirm("LINE合同グループに自動投稿します。よろしいですか？")) {
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch("/api/setup-check/post-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recordId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "投稿に失敗しました");
      }
      setPosted(true);
      onPostSuccess?.();
    } catch (e: any) {
      setPostError(e?.message || "投稿に失敗しました");
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="card space-y-3">
      <div className="bg-green-50 text-green-800 border border-green-200 rounded-xl p-3 text-sm font-semibold">
        ✅ 設営後チェックを登録しました
      </div>

      <div>
        <div className="label">LINE 投稿用テキスト</div>
        <textarea
          readOnly
          value={text}
          rows={Math.min(20, text.split("\n").length + 1)}
          className="field font-mono text-xs whitespace-pre"
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />
        {posted && (
          <p className="text-xs text-green-700 mt-1 font-semibold">
            ✅ LINE合同グループに投稿しました
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={handleCopy} className="btn-primary">
          {copied ? "✓ コピーしました" : "📋 コピー"}
        </button>
        <button
          type="button"
          onClick={handlePostToLine}
          disabled={posting || posted || !recordId}
          className="btn-primary bg-green-600 hover:bg-green-700 disabled:bg-stone-300 disabled:cursor-not-allowed"
        >
          {posting ? "投稿中..." : posted ? "✅ 投稿済み" : "🤖 Botで投稿"}
        </button>
      </div>

      {postError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-2">
          エラー: {postError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a
          href="https://line.me/R/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-center"
        >
          LINEを開く（手動）
        </a>
        <Link href="/" className="btn-secondary text-center">
          🏠 トップへ
        </Link>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="btn-secondary w-full"
      >
        続けて別のチェックを入力
      </button>
    </section>
  );
}
