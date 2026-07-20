"use client";

import { useCallback, useEffect, useState } from "react";
import { yen } from "@/lib/format";
import {
  fetchInquiries,
  loadAnalyticsLookup,
  updateStatus,
  deleteInquiry,
  checkOkLimit,
  okQuota,
  displaySlot,
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

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

function fmtDate(d: string | null): string {
  if (!d) return "日付未定";
  const [, m, day] = d.split("-");
  return `${parseInt(m, 10)}/${parseInt(day, 10)}`;
}

/** グループ見出し用: '7/4（金）' */
function dateHeading(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const w = new Date(y, m - 1, day).getDay();
  return `${m}/${day}（${WEEKDAY[w]}）`;
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

/** 日付ごとにグループ化（fetchが date昇順・null末尾で返す前提） */
type DateGroup = { key: string; label: string; rows: VenueInquiry[] };
function groupByDate(rows: VenueInquiry[]): DateGroup[] {
  const groups: DateGroup[] = [];
  const index = new Map<string, DateGroup>();
  for (const r of rows) {
    const key = r.date ?? "__none__";
    let g = index.get(key);
    if (!g) {
      g = {
        key,
        label: r.date ? dateHeading(r.date) : "日付未設定",
        rows: [],
      };
      index.set(key, g);
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
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

export default function VenuesView({
  onRegisterShift,
}: {
  onRegisterShift: (inq: { date: string | null; storeName: string }) => void;
}) {
  const [rows, setRows] = useState<VenueInquiry[] | null>(null);
  const [lookup, setLookup] = useState<AnalyticsLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // フォーム制御
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VenueInquiry | null>(null);

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

  /** 1件削除（確認ダイアログあり） */
  const onDelete = async (row: VenueInquiry) => {
    setNotice(null);
    const label = `${fmtDate(row.date)} ${row.store_name}`;
    if (!window.confirm(`「${label}」の記録を削除しますか？`)) return;
    try {
      await deleteInquiry(row.id);
      await reload();
    } catch (e: any) {
      setNotice(e?.message || String(e));
    }
  };

  const groups = rows ? groupByDate(rows) : [];

  return (
    <div className="pb-4">
      <p className="text-sm text-stone-600 text-center mb-4">
        誰がどの店にいつ連絡したかを共有し、二重連絡を防ぎます
      </p>

      <button onClick={openCreate} className="btn-primary w-full mb-4 shadow">
        ＋ 問い合わせを追加
      </button>

      {error && (
        <div className="card bg-red-50 border border-red-200 text-red-700 text-sm mb-3">
          エラー: {error}
        </div>
      )}
      {notice && (
        <div className="card bg-amber-50 border border-amber-200 text-amber-800 text-sm whitespace-pre-wrap mb-3">
          {notice}
        </div>
      )}

      {loading && !rows && (
        <p className="text-center text-sm text-stone-500">読み込み中…</p>
      )}

      {rows && rows.length === 0 && (
        <p className="text-center text-sm text-stone-500 py-8">
          まだ問い合わせの記録がありません。「＋ 追加」から登録できます。
        </p>
      )}

      {/* 一覧（日付ごとにグループ表示・近い順） */}
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.key} className="space-y-3">
            <div className="flex items-center gap-2 pt-1">
              <span className="text-stone-300">━</span>
              <h2 className="text-sm font-bold text-stone-600">{group.label}</h2>
              <span className="flex-1 border-t border-stone-200" />
            </div>

            {group.rows.map((row) => {
              const stats = lookup?.statsOf(row.store_name) ?? null;
              const quota = rows
                ? okQuota({
                    rows,
                    rankKindOf,
                    storeName: row.store_name,
                    date: row.date,
                  })
                : { applicable: false as const };
              const slotLabel = displaySlot(row.slot);
              return (
                <div
                  key={row.id}
                  className="bg-white rounded-2xl shadow-md ring-1 ring-stone-200 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {slotLabel && (
                        <span className="text-xs text-indigo-500 font-bold">
                          {slotLabel}
                        </span>
                      )}
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

                  {/* 残り出店可能回数 */}
                  {quota.applicable && (
                    <div className="text-xs">
                      {quota.remaining > 0 ? (
                        <span className="text-emerald-600 font-bold">
                          今月あと{quota.remaining}回OK可
                        </span>
                      ) : (
                        <span className="text-red-500 font-bold">
                          今月上限に達しています
                        </span>
                      )}
                      <span className="text-stone-400">
                        （{quota.aggregate ? "D全店 " : ""}
                        {quota.current}/{quota.limit}）
                      </span>
                    </div>
                  )}

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

                  {/* OKになった問い合わせ → 出店予定に登録（連携） */}
                  {row.status === "OK" && (
                    <button
                      onClick={() =>
                        onRegisterShift({
                          date: row.date,
                          storeName: row.store_name,
                        })
                      }
                      className="w-full text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg py-2 hover:bg-emerald-100"
                    >
                      📅 この店を出店予定に登録
                    </button>
                  )}

                  {/* 操作（ログイン不要・誰でも可） */}
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
                    <button
                      onClick={() => onDelete(row)}
                      className="text-xs text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 ml-auto"
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

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
    </div>
  );
}
