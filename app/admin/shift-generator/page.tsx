"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AdminGate from "@/app/components/AdminGate";

const LOADING_MESSAGES = [
  { atSeconds: 0, text: "PDFをアップロード中…" },
  { atSeconds: 5, text: "Claude API でPDFを解析中… 約60秒かかります" },
  { atSeconds: 30, text: "もう少しです（PDF解析中）…" },
  { atSeconds: 70, text: "シフトを組み立て中…" },
  { atSeconds: 90, text: "ほぼ完了です…" },
];

export default function ShiftGeneratorPage() {
  return (
    <AdminGate>
      <UploadView />
    </AdminGate>
  );
}

// ---------------------------------------------------------------------------
// メール解析モード（新セクション）
// ---------------------------------------------------------------------------

type AuthStatus =
  | { connected: false; error?: string }
  | {
      connected: true;
      email: string;
      expiresAt: string;
      expired: boolean;
      hasRefreshToken: boolean;
    };

type EmailListItem = {
  id: string;
  threadId: string | null;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
};

function EmailModeSection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [emails, setEmails] = useState<EmailListItem[] | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [oauthMessage, setOauthMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const reloadStatus = useCallback(async () => {
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/google/status");
      const json = await res.json();
      setAuthStatus(json);
    } catch (e: any) {
      setAuthStatus({ connected: false, error: e?.message || String(e) });
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadStatus();
  }, [reloadStatus]);

  // OAuth コールバックリダイレクト後のメッセージ表示
  useEffect(() => {
    const ok = searchParams.get("oauth");
    const err = searchParams.get("oauth_error");
    if (ok === "success") {
      setOauthMessage({
        kind: "success",
        text: "Gmail連携に成功しました",
      });
    } else if (err) {
      setOauthMessage({
        kind: "error",
        text: `Gmail連携に失敗しました: ${err}`,
      });
    }
  }, [searchParams]);

  const handleConnect = () => {
    window.location.href = "/api/auth/google";
  };

  const handleDisconnect = async () => {
    if (!confirm("Gmail連携を解除します。よろしいですか？")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/auth/google/disconnect", {
        method: "POST",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "切断失敗");
      setEmails(null);
      await reloadStatus();
    } catch (e: any) {
      alert(e?.message || "切断に失敗しました");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleFetch = async () => {
    setEmailsLoading(true);
    setEmailsError(null);
    try {
      const res = await fetch("/api/shift-generator/email/list?months=6");
      const json = await res.json();
      if (!res.ok) {
        if (json.needsReauth) {
          setEmailsError(
            "認証の有効期限が切れているか、未連携です。再連携してください。",
          );
        } else {
          throw new Error(json.error || "メール取得失敗");
        }
        return;
      }
      setEmails(json.messages || []);
    } catch (e: any) {
      setEmailsError(e?.message || "メール取得失敗");
    } finally {
      setEmailsLoading(false);
    }
  };

  const handleParse = (messageId: string) => {
    router.push(
      `/admin/shift-generator/email-parse/${encodeURIComponent(messageId)}`,
    );
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-brand-dark">
          📧 メール解析モード（推奨）
        </h2>
        <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
          Phase 1
        </span>
      </div>
      <p className="text-sm text-stone-600 leading-relaxed">
        じゅんさんが大田原さん宛てに送った「出店希望日メール」を Gmail から取得して、
        仮シフト（pending状態）として一括登録します。
      </p>

      {oauthMessage && (
        <div
          className={`text-sm font-semibold p-3 rounded-xl border ${
            oauthMessage.kind === "success"
              ? "bg-green-50 text-green-800 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {oauthMessage.kind === "success" ? "✅" : "❌"} {oauthMessage.text}
        </div>
      )}

      {authLoading ? (
        <div className="text-sm text-stone-500">認証状態を確認中…</div>
      ) : !authStatus || !authStatus.connected ? (
        <div className="space-y-2">
          <div className="text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-xl p-3">
            Gmail と未連携です。下記ボタンから Google 認証を行ってください。
          </div>
          <button
            type="button"
            onClick={handleConnect}
            className="btn-primary w-full"
          >
            🔗 Google認証で連携する
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm bg-green-50 text-green-900 border border-green-200 rounded-xl p-3">
            ✅ 連携済み: <strong>{authStatus.email}</strong>
            <span className="ml-2 text-xs text-stone-600">
              (有効期限: {new Date(authStatus.expiresAt).toLocaleString("ja-JP")}
              {authStatus.expired ? " — 期限切れ・自動リフレッシュ予定" : ""})
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleFetch}
              disabled={emailsLoading}
              className="btn-primary"
            >
              {emailsLoading ? "⏳ 取得中…" : "📥 Gmailから希望メールを取得"}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="btn-secondary"
            >
              {disconnecting ? "切断中…" : "🚫 連携解除"}
            </button>
          </div>

          {emailsError && (
            <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-xl p-3">
              ❌ {emailsError}
            </div>
          )}

          {emails && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">
                取得結果: {emails.length}件
              </div>
              {emails.length === 0 ? (
                <div className="text-sm text-stone-500 italic">
                  該当するメールが見つかりませんでした。検索クエリ:
                  <code className="text-xs bg-stone-100 px-1 ml-1">
                    from:tebaya1222@gmail.com to:food-assistant@m-nagayama.co.jp
                    newer_than:6m
                  </code>
                </div>
              ) : (
                <div className="border border-stone-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-xs">
                      <tr>
                        <th className="text-left p-2">日付</th>
                        <th className="text-left p-2">件名／抜粋</th>
                        <th className="text-right p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {emails.map((m) => (
                        <tr
                          key={m.id}
                          className="border-t border-stone-100 hover:bg-stone-50"
                        >
                          <td className="p-2 align-top text-xs text-stone-700 whitespace-nowrap">
                            {formatDateLabel(m.date)}
                          </td>
                          <td className="p-2 align-top">
                            <div className="font-semibold text-stone-800">
                              {m.subject || "(件名なし)"}
                            </div>
                            <div className="text-xs text-stone-500 mt-0.5 line-clamp-2">
                              {m.snippet}
                            </div>
                          </td>
                          <td className="p-2 align-top text-right">
                            <button
                              type="button"
                              onClick={() => handleParse(m.id)}
                              className="btn-primary text-xs px-2 py-1"
                            >
                              解析する →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDateLabel(rfcDate: string): string {
  const t = Date.parse(rfcDate);
  if (Number.isNaN(t)) return rfcDate;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

// ---------------------------------------------------------------------------
// PDF アップロード（既存・互換のため残置）
// ---------------------------------------------------------------------------

function UploadView() {
  const router = useRouter();
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submitting) return;
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [submitting]);

  const yearOptions: number[] = [];
  for (let y = defaultYear - 1; y <= defaultYear + 1; y++) yearOptions.push(y);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("PDFファイルを選んでください");
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("PDFファイルを選んでください");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      fd.append("year", String(year));
      fd.append("month", String(month));
      const res = await fetch("/api/shift-generator/generate", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "生成に失敗しました");
      }
      const key = `shift-preview-${Date.now()}`;
      try {
        sessionStorage.setItem(key, JSON.stringify(json.data));
      } catch (storageErr: any) {
        throw new Error(
          "プレビューデータの一時保存に失敗しました（容量超過？）: " +
            (storageErr?.message || ""),
        );
      }
      router.push(
        `/admin/shift-generator/preview?key=${encodeURIComponent(key)}&year=${year}&month=${month}`,
      );
    } catch (err: any) {
      setError(err?.message || String(err));
      setSubmitting(false);
    }
  };

  const currentMessage =
    [...LOADING_MESSAGES].reverse().find((m) => elapsed >= m.atSeconds)?.text ||
    LOADING_MESSAGES[0].text;

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">
          🗓️ シフト自動生成
        </h1>
        <div className="flex gap-2">
          <Link href="/admin" className="btn-secondary text-sm">
            ← 管理者トップ
          </Link>
        </div>
      </header>

      <EmailModeSection />

      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-brand-dark">
          📎 PDFアップロード（旧モード）
        </h2>
        <p className="text-sm text-stone-600 leading-relaxed">
          ながやまPDFスケジュール表をアップロードして、月次シフトを自動生成します。
          メール解析モードが基本ですが、PDF だけしか手元にない場合はこちらを使用してください。
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">📎 ながやまPDF</label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={onFileChange}
              disabled={submitting}
              className="block w-full text-sm text-stone-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand file:text-white hover:file:bg-brand-dark disabled:opacity-50"
            />
            {file && (
              <div className="text-xs text-stone-500 mt-1">
                選択中: {file.name}（{Math.round(file.size / 1024)} KB）
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">📅 対象年</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                disabled={submitting}
                className="field"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">📅 対象月</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                disabled={submitting}
                className="field"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !file}
            className="btn-primary w-full"
          >
            {submitting ? "⏳ 生成中…" : "シフトを生成"}
          </button>
        </form>
      </div>

      {submitting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl space-y-4">
            <div className="text-center">
              <div className="text-5xl animate-bounce mb-3">🗓️</div>
              <h2 className="text-lg font-bold text-brand-dark">
                シフト生成中…
              </h2>
              <p className="text-sm text-stone-600 mt-2">{currentMessage}</p>
            </div>
            <div className="text-center text-3xl font-mono font-bold text-stone-700">
              {elapsed}秒
            </div>
            <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand h-full transition-all duration-1000"
                style={{
                  width: `${Math.min((elapsed / 90) * 100, 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-stone-500 text-center">
              ※ ブラウザを閉じないでください
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
