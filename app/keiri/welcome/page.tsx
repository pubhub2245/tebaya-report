"use client";

/**
 * 経理パッケージ：初回設定（/keiri/welcome）
 *
 * ■ これは何？
 *   経理パッケージを申し込んだお店が、いちばん最初に開く画面です。
 *   入れるのは**3つだけ**にしてあります。
 *     ① お店の名前
 *     ② 数え始めの日（この日から利益と現金を数えます）
 *     ③ その日の手元の現金
 *
 * ■ なぜ3つだけか
 *   人が手を貸さずに使い始められる状態（無人販売）にするためです。
 *   項目を増やすと、必ず「分からないので聞きたい」が発生します。
 *   ★これ以上項目を足さないこと。足したくなったら相談する。
 *
 * ■ 手羽屋の画面ではありません
 *   この画面は新しく申し込んだお店ぶんの設定だけを作ります。
 *   手羽屋の日報・シフト・LINE・既存の設定には一切触れません。
 *
 * ■ 合言葉（パスワード）
 *   保存できたときだけ、管理画面に入るための合言葉が1回だけ出ます。
 *   画面を閉じると二度と出ないので、その場で控えてもらいます。
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { normalizeTenantScope, writeTenantScope } from "@/lib/tenantScope";
import { KEIRI_COMPANY } from "@/lib/keiri/legal";
import { paidPendingMailto } from "@/lib/keiri/paidPending";

/**
 * ★ 入れ物を1枚かぶせてある理由
 *   URL の「?t=…」を読む部品（useSearchParams）は、
 *   ページを先に作っておく作り方（静的書き出し）と相性が悪く、
 *   そのまま置くとビルドが止まります。
 *   読み込み中の表示を1枚はさむと通ります（Next.js の決まり）。
 */
export default function KeiriWelcomePage() {
  return (
    <Suspense
      fallback={<main className="max-w-md mx-auto px-4 py-5 text-sm text-stone-500">読み込み中…</main>}
    >
      <WelcomeForm />
    </Suspense>
  );
}

function WelcomeForm() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";
  const session = params.get("session") ?? "";

  const [shopName, setShopName] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  /** このお店の番号。スタッフの端末に配る「日報の入り口」のリンクに使う */
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  /**
   * 支払いのリンクで先に払われた方が来たとき（kp95）。
   * お店の行がまだ無いので初回設定は終われないが、**行き止まりにはしない**。
   * pending.reached が false のときだけ「メールで1通」をお願いする。
   */
  const [pending, setPending] = useState<{ message: string; reached: boolean } | null>(null);

  const linkMissing = !token && !session;

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/keiri/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, session, shopName, openingDate, openingBalance }),
      });
      const json = await res.json();
      // ★先に「お預かりしました」を見る（kp95）。
      //   ここを後ろに置くと、赤い「使えません」が出てしまう。
      if (json?.pending) {
        setPending({
          message: String(json?.message ?? "お手続きを確認しています。担当からすぐにご連絡します。"),
          reached: json?.notified === true || json?.saved === true,
        });
        return;
      }
      if (!res.ok || !json?.ok) {
        setError(String(json?.message ?? "保存できませんでした。もう一度お試しください。"));
        return;
      }
      // このブラウザを「このお店」として覚える。
      // これ以降、日報はこのお店の印で保存され、経理画面もこのお店のぶんだけを出す
      // （手羽屋の画面とデータは混ざらない。lib/tenantScope.ts）。
      writeTenantScope(json.tenantId ?? null);
      setTenantId(normalizeTenantScope(json.tenantId));
      setAdminPassword(String(json.adminPassword ?? ""));
      if (json.warning) setWarning(String(json.warning));
    } catch {
      setError("通信できませんでした。電波のよい所でもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // 支払いのリンクで先に払われた方（お店の行がまだ無い）：kp95
  //   「このリンクは使えません」で終わらせない。
  //   こちらが折り返すので、ご本人は待っていればよいと分かる形にする。
  // ------------------------------------------------------------------
  if (pending) {
    const mail = paidPendingMailto({
      to: KEIRI_COMPANY.email,
      session,
      shopName,
    });
    return (
      <main className="max-w-md mx-auto px-4 py-5 pb-10 space-y-4">
        <h1 className="text-2xl font-bold text-brand-dark">お手続きを確認しています</h1>

        <div className="card text-sm leading-relaxed space-y-2 bg-amber-50 border border-amber-200 text-amber-900">
          <div className="font-bold">{pending.message}</div>
          <div>
            お支払いは済んでいます（この画面を閉じても、お支払いが消えることはありません）。
            はじめの設定は、こちらでお店のご登録を済ませてから、専用のリンクをお送りします。
          </div>
        </div>

        {pending.reached ? (
          <div className="card text-sm leading-relaxed">
            担当に届いています。このページは閉じて構いません。
          </div>
        ) : (
          <div className="card text-sm leading-relaxed space-y-2">
            <div className="font-bold">お手数ですが、1通だけお送りください</div>
            <div>
              いまこちらへの自動の連絡がうまくいきませんでした。
              下のボタンを押すと、必要なことが入った下書きが開きます。送信するだけです。
            </div>
            <a href={mail.url} className="btn-primary text-sm inline-block">
              メールの下書きを開く
            </a>
            <div className="text-xs text-stone-500 break-all">
              うまく開かないときは {mail.to} まで、次の番号を添えてご連絡ください：{session}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Link href="/keiri/help" className="btn-secondary text-sm">
            困ったとき
          </Link>
          <Link href="/keiri/case" className="btn-secondary text-sm">
            ご案内を見る
          </Link>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------------
  // 保存できたあと：合言葉を1回だけ出す
  // ------------------------------------------------------------------
  if (adminPassword) {
    return (
      <main className="max-w-md mx-auto px-4 py-5 pb-10 space-y-4">
        <h1 className="text-2xl font-bold text-brand-dark">設定できました</h1>

        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2">
          <div className="text-sm font-bold text-amber-900">
            管理画面に入るための合言葉（この画面だけに出ます）
          </div>
          <div className="text-2xl font-bold tracking-wider text-amber-900 select-all">
            {adminPassword}
          </div>
          <div className="text-xs text-amber-800 leading-relaxed">
            スクリーンショットを撮るか、メモ帳に控えてください。
            この画面を閉じると二度と表示されません（合言葉は当方でも見られない形で保管します）。
            なくしたときは作り直しになります。
          </div>
        </div>

        {warning && (
          <div className="card text-sm bg-amber-50 text-amber-900 border border-amber-200">
            {warning}
          </div>
        )}

        <div className="card text-sm leading-relaxed space-y-2">
          <div className="font-bold">次にやること</div>
          <div>
            営業が終わったら「営業後日報」を打つだけです。
            月の利益・いまの手元の現金・まだ払っていないお金は自動で出ます。
          </div>
        </div>

        {tenantId && (
          <div className="card text-sm leading-relaxed space-y-2">
            <div className="font-bold">スタッフの端末で日報を打つとき</div>
            <div>
              下のリンクを、日報を打つ人のスマホに1回だけ開いてもらってください。
              その端末は「このお店の端末」として覚えられ、以後は何もしなくて大丈夫です。
              <strong>このリンクを開いていない端末で打つと、別のお店の日報として保存されます。</strong>
            </div>
            <div className="rounded-xl bg-stone-100 px-3 py-2 text-xs break-all select-all">
              {`${typeof window === "undefined" ? "" : window.location.origin}/report?s=${tenantId}`}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Link href="/report" className="btn-primary text-sm">
            日報を打ってみる
          </Link>
          <Link href="/keiri/help" className="btn-secondary text-sm">
            困ったとき
          </Link>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------------
  // 入力画面
  // ------------------------------------------------------------------
  return (
    <main className="max-w-md mx-auto px-4 py-5 pb-10 space-y-4">
      <h1 className="text-2xl font-bold text-brand-dark">はじめの設定</h1>
      <p className="text-sm text-stone-500 leading-relaxed">
        入れるのは3つだけです。1分で終わります。
        あとから管理画面で直せます。
      </p>

      {linkMissing && (
        <div className="card text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
          このページを開くためのリンクが見当たりません。
          申し込み完了の画面に出ていたリンクから開き直してください。
        </div>
      )}

      {error && (
        <div className="card text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="card space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-bold">① お店の名前</span>
          <input
            type="text"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="例：○○商店"
            className="w-full rounded-xl border border-stone-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-bold">② 数え始めの日</span>
          <input
            type="date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-3 py-2"
          />
          <span className="block text-xs text-stone-500 leading-relaxed">
            この日から利益と手元の現金を数えます。今日か、今月のはじめの日がおすすめです。
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-bold">③ その日の手元の現金</span>
          <input
            type="text"
            inputMode="numeric"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            placeholder="例：30000"
            className="w-full rounded-xl border border-stone-300 px-3 py-2"
          />
          <span className="block text-xs text-stone-500 leading-relaxed">
            レジと金庫にあるお金の合計です。分からなければ 0 でも構いません（あとで直せます）。
          </span>
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={saving || linkMissing}
          className="btn-primary w-full disabled:opacity-50"
        >
          {saving ? "保存中…" : "この3つで始める"}
        </button>
      </div>

      <p className="text-xs text-stone-400 leading-relaxed">
        入力した内容は、このお店ぶんの設定としてだけ使います。
        ほかのお店のデータと混ざることはありません。
      </p>
    </main>
  );
}
