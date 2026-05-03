"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import AdminGate from "@/app/components/AdminGate";

type ResolvedItem = {
  store: string;
  dateISO: string;
  year: number;
  month: number;
  location: { id: number; name: string; rank: string; target: number } | null;
  conflict: {
    existingShiftId: number;
    existingStaff: string | null;
    existingStatus: string | null;
    existingNote: string | null;
  } | null;
};

type ParseResponse = {
  message: {
    id: string;
    threadId: string | null;
    subject: string;
    from: string;
    to: string;
    date: string;
    plaintextBody: string;
    snippet: string;
  };
  parsed: {
    months: Array<{
      year: number;
      month: number;
      requests: Array<{ store: string; dates: string[] }>;
    }>;
    warnings: string[];
  };
  resolvedItems: ResolvedItem[];
  summary: {
    totalDates: number;
    unmatchedLocation: number;
    conflicts: number;
  };
};

type Decision = "register" | "skip" | "overwrite";

export default function EmailParsePage() {
  return (
    <AdminGate>
      <Inner />
    </AdminGate>
  );
}

function Inner() {
  const router = useRouter();
  const params = useParams<{ messageId: string }>();
  const messageId = decodeURIComponent(params.messageId);
  const [data, setData] = useState<ParseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    conflicts: { dateISO: string; reason: string; store: string }[];
  } | null>(null);
  const [showRawBody, setShowRawBody] = useState(false);

  // 初回ロード
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/shift-generator/email/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "解析失敗");
        if (cancelled) return;
        setData(json);

        // 初期決定: location マッチ済み＆衝突なし → register
        // 衝突あり → skip（デフォルト）
        // location 未マッチ → skip
        const initial = new Map<string, Decision>();
        for (const item of json.resolvedItems as ResolvedItem[]) {
          const k = keyOf(item);
          if (!item.location) {
            initial.set(k, "skip");
          } else if (item.conflict) {
            initial.set(k, "skip");
          } else {
            initial.set(k, "register");
          }
        }
        setDecisions(initial);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "解析失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  const counts = useMemo(() => {
    if (!data) return { register: 0, overwrite: 0, skip: 0, total: 0 };
    let register = 0,
      overwrite = 0,
      skip = 0;
    for (const item of data.resolvedItems) {
      const d = decisions.get(keyOf(item)) || "skip";
      if (d === "register") register++;
      else if (d === "overwrite") overwrite++;
      else skip++;
    }
    return {
      register,
      overwrite,
      skip,
      total: data.resolvedItems.length,
    };
  }, [data, decisions]);

  const updateDecision = (item: ResolvedItem, d: Decision) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(keyOf(item), d);
      return next;
    });
  };

  const onRegister = async () => {
    if (!data) return;
    if (counts.register + counts.overwrite === 0) {
      alert("登録対象が0件です");
      return;
    }
    if (
      !confirm(
        `登録予定: 新規${counts.register}件 / 上書き${counts.overwrite}件\nスキップ${counts.skip}件\n\n登録しますか？`,
      )
    ) {
      return;
    }

    setRegistering(true);
    setRegisterResult(null);
    try {
      const items: Array<{
        dateISO: string;
        locationId: number;
        store: string;
        overwriteExistingId?: number;
      }> = [];
      for (const item of data.resolvedItems) {
        const d = decisions.get(keyOf(item)) || "skip";
        if (d === "skip") continue;
        if (!item.location) continue; // 防御的
        if (d === "overwrite" && item.conflict) {
          items.push({
            dateISO: item.dateISO,
            locationId: item.location.id,
            store: item.store,
            overwriteExistingId: item.conflict.existingShiftId,
          });
        } else if (d === "register") {
          items.push({
            dateISO: item.dateISO,
            locationId: item.location.id,
            store: item.store,
          });
        }
      }

      const res = await fetch("/api/shift-generator/email/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: data.message.id,
          requestedAt: data.message.date
            ? new Date(data.message.date).toISOString()
            : undefined,
          items,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "登録失敗");
      }
      setRegisterResult({
        inserted: json.inserted ?? 0,
        updated: json.updated ?? 0,
        skipped: json.skipped ?? 0,
        conflicts: json.conflicts ?? [],
      });
    } catch (e: any) {
      alert(e?.message || "登録失敗");
    } finally {
      setRegistering(false);
    }
  };

  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="card text-sm text-stone-600">解析中…</div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="card bg-red-50 text-red-700 border border-red-200">
          ❌ {error || "データなし"}
        </div>
        <Link href="/admin/shift-generator" className="btn-secondary mt-4">
          ← 戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">
          📧 メール解析プレビュー
        </h1>
        <Link href="/admin/shift-generator" className="btn-secondary text-sm">
          ← 戻る
        </Link>
      </header>

      {/* メールヘッダ表示 */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold">解析対象メール</h2>
        <div className="text-sm space-y-1">
          <div>
            <span className="text-stone-500">件名: </span>
            <span className="font-semibold">{data.message.subject}</span>
          </div>
          <div>
            <span className="text-stone-500">送信日時: </span>
            {data.message.date}
          </div>
          <div>
            <span className="text-stone-500">From: </span>
            {data.message.from}
          </div>
          <div>
            <span className="text-stone-500">To: </span>
            {data.message.to}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowRawBody((b) => !b)}
          className="text-xs text-blue-700 underline"
        >
          {showRawBody ? "本文を隠す" : "本文を表示"}
        </button>
        {showRawBody && (
          <pre className="text-xs bg-stone-50 border border-stone-200 rounded p-2 whitespace-pre-wrap max-h-72 overflow-auto">
            {data.message.plaintextBody || "(本文なし)"}
          </pre>
        )}
      </section>

      {/* パーサー警告 */}
      {data.parsed.warnings.length > 0 && (
        <section className="card bg-yellow-50 border-yellow-200 space-y-1">
          <div className="text-sm font-semibold text-yellow-900">
            ⚠️ パーサー警告 ({data.parsed.warnings.length}件)
          </div>
          <ul className="text-xs text-yellow-900 list-disc pl-5 space-y-0.5">
            {data.parsed.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* サマリー */}
      <section className="card grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-stone-500">登録予定</div>
          <div className="text-2xl font-bold text-green-700">
            {counts.register}
          </div>
        </div>
        <div>
          <div className="text-xs text-stone-500">上書き</div>
          <div className="text-2xl font-bold text-blue-700">
            {counts.overwrite}
          </div>
        </div>
        <div>
          <div className="text-xs text-stone-500">スキップ</div>
          <div className="text-2xl font-bold text-stone-500">
            {counts.skip}
          </div>
        </div>
      </section>

      {/* 月別の希望日リスト */}
      {data.parsed.months.map((m) => (
        <section key={`${m.year}-${m.month}`} className="card space-y-2">
          <h2 className="text-base font-bold">
            📅 {m.year}年{m.month}月（
            {data.resolvedItems.filter((x) => x.month === m.month).length}件）
          </h2>
          <div className="space-y-1">
            {data.resolvedItems
              .filter((x) => x.month === m.month)
              .map((item) => {
                const k = keyOf(item);
                const d = decisions.get(k) || "skip";
                return (
                  <ItemRow
                    key={k}
                    item={item}
                    decision={d}
                    onChange={(nd) => updateDecision(item, nd)}
                  />
                );
              })}
          </div>
        </section>
      ))}

      {/* 登録結果 */}
      {registerResult && (
        <section className="card bg-green-50 border-green-200">
          <h2 className="text-base font-bold text-green-900">
            ✅ 登録完了
          </h2>
          <div className="text-sm mt-2 space-y-1">
            <div>新規挿入: {registerResult.inserted}件</div>
            <div>上書き: {registerResult.updated}件</div>
            <div>スキップ: {registerResult.skipped}件</div>
            {registerResult.conflicts.length > 0 && (
              <div className="mt-2">
                <div className="font-semibold">衝突詳細:</div>
                <ul className="text-xs list-disc pl-5">
                  {registerResult.conflicts.map((c, i) => (
                    <li key={i}>
                      {c.dateISO} {c.store}: {c.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <Link href="/admin/shifts" className="btn-primary">
              シフト一覧へ
            </Link>
            <Link href="/admin/shift-generator" className="btn-secondary">
              シフト生成画面に戻る
            </Link>
          </div>
        </section>
      )}

      {/* 登録ボタン */}
      {!registerResult && (
        <div className="sticky bottom-0 bg-white border-t border-stone-200 -mx-4 px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary flex-1"
            disabled={registering}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onRegister}
            disabled={
              registering || counts.register + counts.overwrite === 0
            }
            className="btn-primary flex-[2]"
          >
            {registering
              ? "⏳ 登録中…"
              : `この内容で仮シフト登録 (${counts.register + counts.overwrite}件)`}
          </button>
        </div>
      )}
    </main>
  );
}

function keyOf(item: ResolvedItem): string {
  return `${item.dateISO}|${item.store}`;
}

function ItemRow({
  item,
  decision,
  onChange,
}: {
  item: ResolvedItem;
  decision: Decision;
  onChange: (d: Decision) => void;
}) {
  const dateLabel = formatJpDate(item.dateISO);
  const noLoc = !item.location;
  const conflict = item.conflict;
  const baseRow =
    decision === "skip"
      ? "opacity-60"
      : decision === "overwrite"
        ? "bg-blue-50"
        : "bg-green-50";

  return (
    <div
      className={`flex items-start gap-2 p-2 rounded-lg border border-stone-200 ${baseRow}`}
    >
      <div className="flex-1 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{dateLabel}</span>
          <span>ながやま{item.store}</span>
          {item.location ? (
            <span className="text-xs text-stone-500">
              (id:{item.location.id} / {item.location.rank}ランク / ¥
              {item.location.target.toLocaleString()})
            </span>
          ) : (
            <span className="text-xs text-red-700 font-semibold">
              ⚠️ locations 未マッチ
            </span>
          )}
        </div>
        {conflict && (
          <div className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded mt-1 px-2 py-1">
            ⚠️ 既存shift(id={conflict.existingShiftId})
            {conflict.existingStaff
              ? ` / 担当: ${conflict.existingStaff}`
              : ""}
            {conflict.existingStatus
              ? ` / status: ${conflict.existingStatus}`
              : ""}
            {conflict.existingNote ? ` / note: ${conflict.existingNote}` : ""}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 text-xs min-w-[6rem]">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={decision === "register"}
            disabled={noLoc || !!conflict}
            onChange={() => onChange("register")}
          />
          登録
        </label>
        {conflict && (
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={decision === "overwrite"}
              onChange={() => onChange("overwrite")}
            />
            上書き
          </label>
        )}
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={decision === "skip"}
            onChange={() => onChange("skip")}
          />
          スキップ
        </label>
      </div>
    </div>
  );
}

function formatJpDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  const w = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
  return `${m}/${d} (${w})`;
}
