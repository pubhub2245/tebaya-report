"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * ⑥ 監視 + ① バックアップ操作パネル（管理者ページ用）。
 *
 * - 最終日報・最終LINE投稿(設営後チェック)・最終バックアップを表示。
 *   一定日数以上あいだが空いていたら警告色にして「静かに止まっている」ことに気づけるようにする。
 * - 「今すぐバックアップ」ボタンで重要データを手動スナップショット。
 * 読み取り＋バックアップのみ。
 */

const REQUIRED = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";

type Health = {
  ok: boolean;
  service_role: boolean;
  last_report_date: string | null;
  last_setup_check: string | null;
  last_interim: string | null;
  last_agenda: string | null;
  backups: { table_name: string; snapshot_date: string; row_count: number }[];
  backup_error: string | null;
};

/** ISO文字列/日付から「何日前か」を返す（null なら null）。 */
function daysAgo(value: string | null): number | null {
  if (!value) return null;
  const t = new Date(value.length <= 10 ? value + "T00:00:00" : value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function fmt(value: string | null): string {
  if (!value) return "記録なし";
  const d = daysAgo(value);
  const shown = value.slice(0, 10);
  if (d == null) return shown;
  if (d <= 0) return `${shown}（今日）`;
  return `${shown}（${d}日前）`;
}

function StatusRow({
  label,
  value,
  warnAfter,
}: {
  label: string;
  value: string | null;
  warnAfter: number;
}) {
  const d = daysAgo(value);
  const warn = value == null || (d != null && d > warnAfter);
  return (
    <div className="flex items-center justify-between gap-2 text-sm py-1">
      <span className="text-stone-600">{label}</span>
      <span
        className={`font-mono ${warn ? "text-red-600 font-bold" : "text-stone-800"}`}
      >
        {warn ? "⚠️ " : "✅ "}
        {fmt(value)}
      </span>
    </div>
  );
}

export default function SystemHealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health", {
        headers: { authorization: `Bearer ${REQUIRED}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "取得に失敗しました");
      setHealth(json);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runBackup = async () => {
    setBackingUp(true);
    setBackupMsg(null);
    try {
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { authorization: `Bearer ${REQUIRED}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        // 時間切れは「失敗」ではなく「途中まで」。原因が分かる言い方にする
        if (json.timedOut) {
          throw new Error(
            `時間切れで途中まで（${json.backed_up}/${json.total}件）。` +
              `未取得: ${(json.skipped || []).join("、")}。` +
              `レシート写真を置き場へ移すと軽くなります`,
          );
        }
        throw new Error(json.error || `一部失敗（${json.backed_up}/${json.total}）`);
      }
      setBackupMsg(`✅ ${json.backed_up}件のテーブルをバックアップしました`);
      load();
    } catch (e: any) {
      setBackupMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setBackingUp(false);
    }
  };

  const lastBackupDate =
    health?.backups && health.backups.length > 0
      ? health.backups
          .map((b) => b.snapshot_date)
          .sort()
          .slice(-1)[0]
      : null;

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-brand-dark">🩺 システム健康状態</h2>
        <button
          onClick={load}
          className="text-xs text-stone-500 underline hover:text-stone-700"
        >
          更新
        </button>
      </div>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-2 py-1">
          ❌ {error}
        </p>
      )}

      {health && (
        <>
          <div className="divide-y divide-stone-100">
            <StatusRow
              label="最終 日報"
              value={health.last_report_date}
              warnAfter={3}
            />
            <StatusRow
              label="最終 LINE投稿（設営後チェック）"
              value={health.last_setup_check}
              warnAfter={7}
            />
            <StatusRow
              label="最終 中間報告"
              value={health.last_interim}
              warnAfter={14}
            />
            <StatusRow
              label="最終 バックアップ"
              value={lastBackupDate}
              warnAfter={7}
            />
          </div>

          {!health.service_role && (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 leading-relaxed">
              ※ バックアップ機能を使うには、Vercelに <code>SUPABASE_SERVICE_ROLE_KEY</code>{" "}
              の設定が必要です（無料・Supabaseの設定画面からコピーできます）。
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={runBackup}
              disabled={backingUp}
              className="btn-secondary text-sm"
            >
              {backingUp ? "バックアップ中…" : "💾 今すぐバックアップ"}
            </button>
            {backupMsg && (
              <span className="text-xs text-stone-600">{backupMsg}</span>
            )}
          </div>

          {health.backups.length > 0 && (
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">
                バックアップ済みテーブル（{health.backups.length}件）
              </summary>
              <div className="pt-1 space-y-0.5">
                {health.backups.map((b) => (
                  <div key={b.table_name} className="flex justify-between">
                    <span>{b.table_name}</span>
                    <span className="font-mono">
                      {b.snapshot_date}／{b.row_count}件
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <p className="text-[11px] text-stone-400 leading-relaxed">
            「最終◯◯」が長く更新されていない（⚠️赤字）ときは、その機能が止まっている可能性があります。
            バックアップは重要データ（売上・現金・立替・意見箱など）の写しを安全な場所に保存します。
          </p>
        </>
      )}
    </section>
  );
}
