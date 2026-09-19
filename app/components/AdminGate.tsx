"use client";

import { useEffect, useState } from "react";

import {
  ADMIN_PASSWORD_CONFIGURED,
  ADMIN_PASSWORD_SETUP_MESSAGE,
  checkAdminPassword,
} from "@/lib/adminPassword";
import {
  TEBAYA_SCOPE,
  normalizeTenantScope,
  writeTenantScope,
  type TenantScope,
} from "@/lib/tenantScope";

const SS_KEY = "admin-auth";

/**
 * 申し込んだお店として入っていることを、そのタブのあいだだけ覚えておく名前。
 *
 * ★ lib/tenantScope.ts の控え（どのお店として開いているか）とは別物です。
 *   あちらは「どのお店の日報か」の印で、閉じても残ります。
 *   こちらは「合言葉を入れて入った」という印で、タブを閉じれば消えます。
 *   分けておかないと、合言葉を入れていない人が経理の画面を開けてしまいます。
 */
const SS_SHOP_KEY = "keiri-shop-auth";

/**
 * 管理者だけが入れる入口。
 *
 * ■ 手羽屋の入り方は今までと同じです
 *   Vercel に入れてある合言葉をブラウザの中で確かめ、
 *   合えば sessionStorage の "admin-auth" に "1" を覚える——ここは1文字も変えていません。
 *
 * ■ 足したこと（kp39）：経理パッケージを申し込んだお店も入れるようにした
 *   申し込んだお店の合言葉は、そのお店ごとに違い、倉庫に**戻せない形**で入っています。
 *   ブラウザの中では確かめようがないので、合わなかったときだけサーバーに聞きます
 *   （/api/keiri/login）。これが無かったため、初回設定で渡した合言葉は
 *   どこにも通用せず、払った店主は必ずはじかれていました。
 *
 * ■ どの画面で使うか
 *   お店も入れるのは **allowShops を付けた画面（経理の画面 /keiri）だけ**です。
 *   /admin・/cash・/shifts・/sales-report などの手羽屋専用の画面は、
 *   今までどおり手羽屋の合言葉しか受け付けません。
 */
export default function AdminGate({
  children,
  /** 経理パッケージを申し込んだお店も入れてよい画面なら true（既定は手羽屋だけ） */
  allowShops = false,
}: {
  children: React.ReactNode;
  allowShops?: boolean;
}) {
  const [authed, setAuthed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  /** 申し込んだお店として入っているときだけ、その番号が入る（手羽屋は null） */
  const [shopScope, setShopScope] = useState<TenantScope>(TEBAYA_SCOPE);
  const [shopName, setShopName] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    // ① 申し込んだお店として、このタブで合言葉を入れて入っていたら、そのまま続きを見せる
    if (allowShops) {
      let saved: TenantScope = TEBAYA_SCOPE;
      try {
        saved = normalizeTenantScope(sessionStorage.getItem(SS_SHOP_KEY));
      } catch {}
      if (saved) {
        setShopScope(saved);
        setAuthed(true);
        return;
      }
    }
    // ② 手羽屋。パスワード未設定のときは「誰でも入れる」ではなく「誰も入れない」。
    //    設定し忘れで管理画面が公開されてしまうのを防ぐため。
    if (!ADMIN_PASSWORD_CONFIGURED) return;
    try {
      if (sessionStorage.getItem(SS_KEY) === "1") setAuthed(true);
    } catch {}
  }, [allowShops]);

  // 入っているお店の名前だけ聞きに行く（画面の隅に出すため。売上も合言葉も返らない窓口）
  useEffect(() => {
    if (!authed || !shopScope) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/keiri/shop?id=${encodeURIComponent(shopScope)}`);
        const json = await res.json().catch(() => null);
        if (!cancelled && json?.ok && json.shopName) setShopName(String(json.shopName));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, shopScope]);

  if (!hydrated) return null;

  if (authed) {
    const showBar = ADMIN_PASSWORD_CONFIGURED || shopScope !== null;
    return (
      <>
        {showBar && (
          <div className="max-w-4xl mx-auto px-4 pt-3 -mb-2 flex justify-end items-center gap-3">
            {shopScope !== null && (
              <span className="text-xs text-stone-500">{shopName ?? "お店の画面"}</span>
            )}
            <button
              onClick={() => {
                try {
                  sessionStorage.removeItem(SS_KEY);
                  sessionStorage.removeItem(SS_SHOP_KEY);
                } catch {}
                setShopScope(TEBAYA_SCOPE);
                setShopName(null);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ① 手羽屋の合言葉（今までどおり、ブラウザの中だけで確かめる）
    if (checkAdminPassword(pw)) {
      try {
        sessionStorage.setItem(SS_KEY, "1");
        sessionStorage.removeItem(SS_SHOP_KEY);
      } catch {}
      // この端末に「よそのお店」の印が残っていたら消す（手羽屋の端末に戻す）
      writeTenantScope(TEBAYA_SCOPE);
      setShopScope(TEBAYA_SCOPE);
      setAuthed(true);
      setError(null);
      return;
    }

    // ② 申し込んだお店の合言葉（サーバーに聞く。経理の画面だけ）
    if (allowShops) {
      setChecking(true);
      try {
        const res = await fetch("/api/keiri/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pw }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          const scope = json.scope === "tenant" ? normalizeTenantScope(json.tenantId) : TEBAYA_SCOPE;
          try {
            if (scope) sessionStorage.setItem(SS_SHOP_KEY, scope);
            else sessionStorage.setItem(SS_KEY, "1");
          } catch {}
          // この端末を「そのお店」として覚える（日報の印と経理画面の絞り込みに使う）
          writeTenantScope(scope);
          setShopScope(scope);
          setAuthed(true);
          setError(null);
          return;
        }
      } catch {
        // 通信できなかったときも「違います」と同じ扱いにする（開けっぱなしにしない）
      } finally {
        setChecking(false);
      }
    }

    setError("パスワードが違います");
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
          <button type="submit" className="btn-primary w-full" disabled={checking}>
            {checking ? "確認中…" : "ログイン"}
          </button>
        </form>
        {/*
          ★ ここから先の出口を、画面ごとに変えている（2026-09-19・kp89）。
            /keiri は「経理パッケージ」の入口でもあるので、
            知らない人（これから申し込むかもしれない店主）も開きます。
            それまでは出口が「← トップに戻る」（＝手羽屋の業務メニュー）だけで、
            ・ご案内やお試し版にたどり着けず、そこで終わっていた
            ・よそのお店の人を、手羽屋の内側の画面に案内してしまっていた
            の2つが起きていた。allowShops を付けた画面（/keiri だけ）で出口を差し替える。
            手羽屋専用の画面（/admin・/cash・/shifts など）は今までどおり
            「← トップに戻る」のままで、1文字も変わらない。
        */}
        {allowShops ? (
          <div className="pt-1 space-y-2 border-t border-stone-200">
            <p className="text-xs text-stone-500 pt-3">
              経理パッケージをまだお使いでない方
            </p>
            <a
              href="/keiri/case"
              className="block text-center text-sm text-brand-dark underline"
            >
              経理パッケージのご案内を見る
            </a>
            <a
              href="/keiri/demo"
              className="block text-center text-sm text-stone-500 underline"
            >
              お試し版を触ってみる（無料・登録不要）
            </a>
          </div>
        ) : (
          <a
            href="/"
            className="block text-center text-sm text-stone-500 underline"
          >
            ← トップに戻る
          </a>
        )}
      </div>
    </main>
  );
}
