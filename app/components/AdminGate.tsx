"use client";

import { useEffect, useState } from "react";

import {
  ADMIN_PASSWORD_CONFIGURED,
  ADMIN_PASSWORD_SETUP_MESSAGE,
  checkAdminPassword,
} from "@/lib/adminPassword";

const SS_KEY = "admin-auth";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    // パスワード未設定のときは「誰でも入れる」ではなく「誰も入れない」。
    // 設定し忘れで管理画面が公開されてしまうのを防ぐため。
    if (!ADMIN_PASSWORD_CONFIGURED) return;
    try {
      if (sessionStorage.getItem(SS_KEY) === "1") setAuthed(true);
    } catch {}
  }, []);

  if (!hydrated) return null;

  if (authed) {
    return (
      <>
        {ADMIN_PASSWORD_CONFIGURED && (
          <div className="max-w-4xl mx-auto px-4 pt-3 -mb-2 flex justify-end">
            <button
              onClick={() => {
                try {
                  sessionStorage.removeItem(SS_KEY);
                } catch {}
                setAuthed(false);
              }}
              className="text-xs text-stone-500 hover:text-stone-700 underline"
            >
              ログアウト
            </button>
          </div>
        )}
        {children}
      </>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkAdminPassword(pw)) {
      try {
        sessionStorage.setItem(SS_KEY, "1");
      } catch {}
      setAuthed(true);
      setError(null);
    } else {
      setError("パスワードが違います");
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-12">
      <div className="card space-y-4">
        <h1 className="text-xl font-bold text-brand-dark text-center">
          🔒 管理者ログイン
        </h1>
        {!ADMIN_PASSWORD_CONFIGURED && (
          <p className="text-sm rounded-xl px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 leading-relaxed">
            ⚠️ {ADMIN_PASSWORD_SETUP_MESSAGE}
          </p>
        )}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">管理者パスワード</label>
            <input
              type="password"
              className="field"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full">
            ログイン
          </button>
        </form>
        <a
          href="/"
          className="block text-center text-sm text-stone-500 underline"
        >
          ← トップに戻る
        </a>
      </div>
    </main>
  );
}
