"use client";

/**
 * お客さん向け公式LINE（@276msmys）に届いたメッセージの一覧（管理者用）。
 *
 * 第1段階＝見るだけ。操作ボタンは無い。
 * 返信は公式LINEアプリの「チャット」から行う（このアプリからは送らない）。
 * 明細は customer_line_messages を新しい順に読むだけ（重い列は無い）。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminGate from "@/app/components/AdminGate";
import { supabase } from "@/lib/supabase";

type Row = {
  id: string;
  line_user_id: string;
  message_type: string;
  message_text: string | null;
  received_at: string;
  status: string;
};

const LIMIT = 100;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string): string {
  if (status === "handled") return "対応済み";
  if (status === "new") return "未対応";
  return status;
}

export default function CustomerLinePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("customer_line_messages")
      .select("id, line_user_id, message_type, message_text, received_at, status")
      .order("received_at", { ascending: false })
      .limit(LIMIT);
    if (error) {
      setError(error.message);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AdminGate>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-brand-dark">💬 お客さんからのLINE</h1>
          <div className="flex gap-2">
            <Link href="/admin" className="btn-secondary text-sm">
              管理者ページ
            </Link>
            <Link href="/" className="btn-secondary text-sm">
              🏠 トップ
            </Link>
          </div>
        </header>

        <p className="text-sm text-stone-600">
          公式LINE（@276msmys）に届いたメッセージを新しい順に表示します（最新{LIMIT}件）。
          返信はこの画面からではなく、公式LINEアプリの「チャット」から行ってください。
        </p>

        <div className="flex justify-end">
          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary text-sm disabled:opacity-50"
          >
            🔄 再読み込み
          </button>
        </div>

        {error && (
          <div className="card bg-red-50 text-red-700 border border-red-200 text-sm">
            読み込みに失敗しました: {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-stone-500">読み込み中…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-stone-500">まだメッセージはありません。</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="card space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                  <span>{fmtDate(r.received_at)}</span>
                  <span>
                    <span className="font-mono">…{r.line_user_id.slice(-4)}</span>
                    <span
                      className={`ml-2 px-2 py-0.5 rounded-full font-bold ${
                        r.status === "handled"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </span>
                </div>
                <p className="text-sm text-stone-800 whitespace-pre-wrap break-words">
                  {r.message_text || `[${r.message_type}]`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AdminGate>
  );
}
