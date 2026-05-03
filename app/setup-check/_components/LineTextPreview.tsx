"use client";

import { useState } from "react";
import Link from "next/link";

export default function LineTextPreview({
  text,
  onReset,
}: {
  text: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      alert("クリップボードにコピーできませんでした。手動で選択してコピーしてください。");
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
        <p className="text-xs text-stone-500 mt-1">
          ※ 自動投稿は次回アップデートで対応予定。今回は手動でLINEに貼り付けてください。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="btn-primary"
        >
          {copied ? "✓ コピーしました" : "📋 コピー"}
        </button>
        <a
          href="https://line.me/R/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-center"
        >
          LINEを開く
        </a>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReset}
          className="btn-secondary flex-1"
        >
          続けて別のチェックを入力
        </button>
        <Link href="/" className="btn-secondary flex-1 text-center">
          🏠 トップへ
        </Link>
      </div>
    </section>
  );
}
