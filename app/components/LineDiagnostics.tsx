"use client";

import { useState } from "react";

type DiagnoseResult = {
  ok: boolean;
  token_set: boolean;
  group_id_found: boolean;
  group_id_source: string | null;
  token_valid: boolean;
  bot_name: string | null;
  sent: boolean | null;
  errors: string[];
};

function Check({ label, ok, extra }: { label: string; ok: boolean; extra?: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-stone-700">{label}</span>
      <span className={`font-bold ${ok ? "text-green-600" : "text-red-600"}`}>
        {ok ? "✅ OK" : "❌ NG"}
        {extra ? ` (${extra})` : ""}
      </span>
    </div>
  );
}

export default function LineDiagnostics() {
  const [loading, setLoading] = useState<null | "check" | "send">(null);
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (send: boolean) => {
    if (send && !confirm("LINEグループにテストメッセージを1通送信します。よろしいですか？"))
      return;
    setLoading(send ? "send" : "check");
    setError(null);
    try {
      const res = await fetch(`/api/line/diagnose${send ? "?send=1" : ""}`);
      const json = (await res.json()) as DiagnoseResult;
      setResult(json);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-brand-dark">🔧 LINE送信の接続チェック</h2>
      <p className="text-xs text-stone-600">
        日報や設営後チェックがLINEに自動送信されないときは、ここで原因を確認できます。
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => run(false)}
          disabled={loading !== null}
          className="flex-1 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-sm px-4 py-3 rounded-xl shadow-md disabled:opacity-50 transition-colors"
        >
          {loading === "check" ? "確認中…" : "🔍 接続を確認"}
        </button>
        <button
          onClick={() => run(true)}
          disabled={loading !== null}
          className="flex-1 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-sm px-4 py-3 rounded-xl shadow-md disabled:opacity-50 transition-colors"
        >
          {loading === "send" ? "送信中…" : "✉️ テスト送信"}
        </button>
      </div>

      {error && (
        <div className="card text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
          ❌ 通信エラー: {error}
        </div>
      )}

      {result && (
        <div
          className={`card space-y-1 border ${
            result.ok
              ? "bg-green-50 border-green-200"
              : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="font-bold text-sm mb-1">
            {result.ok
              ? "✅ LINE連携は正常です"
              : "⚠️ 問題が見つかりました（下記を確認）"}
          </div>
          <Check label="アクセストークンが設定済み" ok={result.token_set} />
          <Check
            label="トークンが有効"
            ok={result.token_valid}
            extra={result.bot_name ? `ボット名: ${result.bot_name}` : undefined}
          />
          <Check
            label="送信先グループが見つかる"
            ok={result.group_id_found}
            extra={result.group_id_source ?? undefined}
          />
          {result.sent !== null && (
            <Check label="テスト送信" ok={result.sent === true} />
          )}
          {result.errors.length > 0 && (
            <ul className="text-xs text-red-700 list-disc pl-5 pt-2 space-y-0.5">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
