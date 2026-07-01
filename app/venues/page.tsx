"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { yen } from "@/lib/format";
import { useAdminAuth } from "@/lib/useAdminAuth";
import {
  fetchInquiries,
  loadAnalyticsLookup,
  updateStatus,
  checkOkLimit,
  STATUS_OPTIONS,
  type VenueInquiry,
  type InquiryStatus,
  type AnalyticsLookup,
} from "@/lib/venueInquiries";
import type { OutletStats, RankKind } from "@/lib/analytics/outletAnalytics";
import InquiryForm from "./_components/InquiryForm";

const STATUS_STYLE: Record<InquiryStatus, string> = {
  未連絡: "bg-stone-200 text-stone-600",
  連絡中: "bg-yellow-100 text-yellow-800",
  OK: "bg-green-100 text-green-700",
  NG: "bg-red-100 text-red-700",
};

const RANK_LABEL: Record<RankKind, string> = {
  A: "ランクA",
  B: "ランクB",
  C: "ランクC",
  D: "ランクD",
  INSUFFICIENT: "データ不足",
  EVENT: "イベント枠",
};

function fmtDate(d: string | null): string {
  if (!d) return "日付未定";
  const [, m, day] = d.split("-");
  return `${parseInt(m, 10)}/${parseInt(day, 10)}`;
}

function fmtContactedAt(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  const jst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  const mo = jst.getUTCMonth() + 1;
  const da = jst.getUTCDate();
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${mo}/${da} ${hh}:${mi}`;
}

/** 売上サマリー表示（機能Bの集計を再利用） */
function SalesSummary({ stats }: { stats: OutletStats | null }) {
  if (!stats) {
    return <span className="text-stone-400">📊 実績なし</span>;
  }
  const rank = RANK_LABEL[stats.rankKind];
  return (
    <span className="text-stone-500">
      📊 平均
      <span className="font-bold text-stone-700">{yen(stats.average)}</span>・
      {rank}・{stats.reportCount}回
    </span>
  );
}

export default function VenuesPage() {
  const { isAdmin, hydrated, login } = useAdminAuth();

  const [rows, setRows] = useState<VenueInquiry[] | null>(null);
  const [lookup, setLookup] = useState<AnalyticsLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // フォーム制御
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VenueInquiry | null>(null);

  // 管理者ログイン入力
  const [showLogin, setShowLogin] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, l] = await Promise.all([fetchInquiries(), loadAnalyticsLookup()]);
      setRows(r);
      setLookup(l);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (row: VenueInquiry) => {
    setEditing(row);
    setFormOpen(true);
  };

  const onSaved = async () => {
    setFormOpen(false);
    setEditing(null);
    await reload();
  };

  const rankKindOf = (storeName: string): RankKind | null =>
    lookup?.rankKindOf(storeName) ?? null;

  /** 一覧のプルダウンでステータス変更（OK化は上限チェック） */
  const onStatusChange = async (row: VenueInquiry, next: InquiryStatus) => {
    setNotice(null);
    if (next === row.status) return;
    if (next === "OK" && rows) {
      const check = checkOkLimit({
        rows,
        rankKindOf,
        editingId: row.id,
        storeName: row.store_name,
        date: row.date,
      });
      if (!check.allowed) {
        setNotice(`⚠️ ${check.message}`);
        return; // ブロック
      }
    }
    try {
      await updateStatus(row.id, next, row.contacted_at);
      await reload();
    } catch (e: any) {
      setNotice(e?.message || String(e));
    }
  };

  const submitLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(pw)) {
      setShowLogin(false);
      setPw("");
      setPwError(null);
    } else {
      setPwError("パスワードが違います");
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24 space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
          {hydrated && !isAdmin && (
            <button
              onClick={() => setShowLogin((v) => !v)}
              className="text-xs text-stone-500 underline hover:text-stone-700"
            >
              🔒 管理者ログイン
            </button>
          )}
        </div>
        <h1 className="text-2xl font-bold text-brand-dark text-center">
          📞 出店先 問い合わせ管理
        </h1>
        <p className="text-sm text-stone-600 text-center">
          誰がどの店にいつ連絡したかを共有し、二重連絡を防ぎます
        </p>
      </header>

      {/* 管理者ログイン（非管理者向け） */}
      {showLogin && !isAdmin && (
        <form
          onSubmit={submitLogin}
          className="card space-y-2 border border-stone-200"
        >
          <label className="label">管理者パスワード</label>
          <input
            type="password"
            className="field"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
          />
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          <button type="submit" className="btn-primary w-full">
            ログインして編集する
          </button>
        </form>
      )}

      {error && (
        <div className="card bg-red-50 border border-red-200 text-red-700 text-sm">
          エラー: {error}
        </div>
      )}
      {notice && (
        <div className="card bg-amber-50 border border-amber-200 text-amber-800 text-sm whitespace-pre-wrap">
          {notice}
        </div>
      )}

      {loading && !rows && (
        <p className="text-center text-sm text-stone-500">読み込み中…</p>
      )}

      {rows && rows.length === 0 && (
        <p className="text-center text-sm text-stone-500 py-8">
          まだ問い合わせの記録がありません。
          {isAdmin && "「＋ 追加」から登録できます。"}
        </p>
      )}

      {/* 一覧（近い予定日順） */}
      {rows && rows.length > 0 && (
        <section className="space-y-3">
          {rows.map((row) => {
            const stats = lookup?.statsOf(row.store_name) ?? null;
            return (
              <div
                key={row.id}
                className="bg-white rounded-2xl shadow-md ring-1 ring-stone-200 p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-stone-500">
                        {fmtDate(row.date)}
                      </span>
                      {row.slot && (
                        <span className="text-xs text-indigo-500 font-bold">
                          {row.slot}
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-brand-dark text-lg leading-tight truncate">
                      {row.store_name}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[row.status]}`}
                  >
                    {row.status}
                  </span>
                </div>

                {/* 売上サマリー（機能B再利用） */}
                <div className="text-xs">
                  <SalesSummary stats={stats} />
                </div>

                {/* 連絡者・連絡日時・担当 */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
                  {row.contacted_by && <span>連絡者: {row.contacted_by}</span>}
                  {row.contacted_at && (
                    <span>連絡日時: {fmtContactedAt(row.contacted_at)}</span>
                  )}
                  {row.assigned_staff && <span>担当: {row.assigned_staff}</span>}
                </div>

                {row.memo && (
                  <p className="text-sm text-stone-600 bg-stone-50 rounded-lg px-2 py-1 whitespace-pre-wrap">
                    {row.memo}
                  </p>
                )}

                {/* 管理者操作 */}
                {isAdmin && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        onStatusChange(row, e.target.value as InquiryStatus)
                      }
                      className="text-xs border border-stone-300 rounded-lg px-2 py-1.5 bg-white"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => openEdit(row)}
                      className="text-xs text-stone-600 border border-stone-300 rounded-lg px-3 py-1.5 hover:bg-stone-50"
                    >
                      編集
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* 追加ボタン（管理者のみ・画面下固定） */}
      {isAdmin && (
        <div className="fixed bottom-0 inset-x-0 bg-gradient-to-t from-white via-white to-transparent p-4">
          <div className="max-w-md mx-auto">
            <button
              onClick={openCreate}
              className="btn-primary w-full shadow-lg"
            >
              ＋ 問い合わせを追加
            </button>
          </div>
        </div>
      )}

      {/* フォーム */}
      {formOpen && rows && (
        <InquiryForm
          mode={editing ? "edit" : "create"}
          initial={editing}
          rows={rows}
          rankKindOf={rankKindOf}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      )}
    </main>
  );
}
