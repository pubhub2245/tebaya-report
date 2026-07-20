"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen, slashDate, todayStr } from "@/lib/format";
import AdminGate from "@/app/components/AdminGate";

type Advance = {
  id: number;
  date: string;
  payer: string;
  amount: number;
  description: string | null;
  receipt_image_url: string | null;
  settled: boolean;
  settled_date: string | null;
  memo: string | null;
};

const PRESET_PAYERS = ["緒方", "川畑"];

/** 画像を縮小してデータURLにする（日報のレシートと同じ方式） */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("読み込み失敗"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像読み込み失敗"));
      img.onload = () => {
        try {
          const max = 1000;
          let { width: w, height: h } = img;
          if (w > max || h > max) {
            if (w >= h) {
              h = Math.round((h * max) / w);
              w = max;
            } else {
              w = Math.round((w * max) / h);
              h = max;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas未対応"));
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        } catch (err) {
          reject(err);
        }
      };
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}

export default function AdvancesPage() {
  return (
    <AdminGate>
      <AdvancesInner />
    </AdminGate>
  );
}

function AdvancesInner() {
  const [rows, setRows] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("advance_expenses")
        .select(
          "id, date, payer, amount, description, receipt_image_url, settled, settled_date, memo",
        )
        .order("date", { ascending: false })
        .order("id", { ascending: false });
      if (error) throw error;
      setRows((data as Advance[]) ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unsettled = useMemo(() => rows.filter((r) => !r.settled), [rows]);
  const settled = useMemo(() => rows.filter((r) => r.settled), [rows]);

  // 立替者ごとの未精算合計（＝誰にいくら返すか）
  const byPayer = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of unsettled) m.set(r.payer, (m.get(r.payer) || 0) + r.amount);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [unsettled]);
  const unsettledTotal = useMemo(
    () => unsettled.reduce((s, r) => s + r.amount, 0),
    [unsettled],
  );

  const settle = async (row: Advance) => {
    if (!confirm(`「${row.payer}さん / ${yen(row.amount)}」を精算（返金済み）にしますか？`))
      return;
    const { error } = await supabase
      .from("advance_expenses")
      .update({ settled: true, settled_date: todayStr() })
      .eq("id", row.id);
    if (error) return alert("失敗: " + error.message);
    load();
  };

  const unsettle = async (row: Advance) => {
    if (!confirm("精算を取り消して「未精算」に戻しますか？")) return;
    const { error } = await supabase
      .from("advance_expenses")
      .update({ settled: false, settled_date: null })
      .eq("id", row.id);
    if (error) return alert("失敗: " + error.message);
    load();
  };

  const remove = async (row: Advance) => {
    if (!confirm(`この立替記録（${row.payer} / ${yen(row.amount)}）を削除しますか？`))
      return;
    const { error } = await supabase
      .from("advance_expenses")
      .delete()
      .eq("id", row.id);
    if (error) return alert("失敗: " + error.message);
    load();
  };

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">🧾 立替・精算</h1>
        <div className="flex gap-2">
          <Link href="/cash" className="btn-secondary text-sm">
            💰 現金残高
          </Link>
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
        </div>
      </header>

      <p className="text-xs text-stone-500 leading-relaxed">
        緒方さん・川畑さんなどが自分のお金で立て替えた分を記録します。登録しても手元現金は減りません。
        「精算した（返金した）」を押した時に手元現金から引かれます。
        ※ 日報の「立替経費」とは別物です（同じものを二重に登録しないでください）。
      </p>

      {error && (
        <div className="card text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
          ❌ {error}
        </div>
      )}

      {/* 返すべきお金（未精算合計） */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-5">
        <div className="text-sm text-amber-800 font-semibold text-center">
          いま返すべきお金（未精算の合計）
        </div>
        <div className="text-3xl font-extrabold font-mono text-amber-700 text-center mt-1">
          {yen(unsettledTotal)}
        </div>
        {byPayer.length > 0 && (
          <div className="mt-3 space-y-1">
            {byPayer.map(([payer, total]) => (
              <div
                key={payer}
                className="flex justify-between text-sm text-amber-900"
              >
                <span>👤 {payer}さんに返す</span>
                <span className="font-mono font-bold">{yen(total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddForm onAdded={load} />

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {/* 未精算リスト */}
      {!loading && (
        <section className="space-y-2">
          <h2 className="font-bold text-stone-700">未精算（{unsettled.length}件）</h2>
          {unsettled.length === 0 && (
            <p className="text-sm text-stone-400">未精算の立替はありません。</p>
          )}
          {unsettled.map((r) => (
            <AdvanceCard
              key={r.id}
              row={r}
              onSettle={() => settle(r)}
              onRemove={() => remove(r)}
            />
          ))}
        </section>
      )}

      {/* 精算済みリスト */}
      {!loading && settled.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-stone-500">精算済み（{settled.length}件）</h2>
          {settled.map((r) => (
            <AdvanceCard
              key={r.id}
              row={r}
              settledView
              onUnsettle={() => unsettle(r)}
              onRemove={() => remove(r)}
            />
          ))}
        </section>
      )}
    </main>
  );
}

/* ---------- 立替カード ---------- */
function AdvanceCard({
  row,
  settledView,
  onSettle,
  onUnsettle,
  onRemove,
}: {
  row: Advance;
  settledView?: boolean;
  onSettle?: () => void;
  onUnsettle?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`card space-y-2 ${settledView ? "opacity-70" : ""}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div>
          <div className="font-bold text-stone-800">👤 {row.payer}</div>
          <div className="text-xs text-stone-500">
            立替日 {slashDate(row.date)}
            {settledView && row.settled_date && (
              <> ／ 精算 {slashDate(row.settled_date)}</>
            )}
          </div>
        </div>
        <div className="text-xl font-bold font-mono whitespace-nowrap">
          {yen(row.amount)}
        </div>
      </div>
      {row.description && (
        <div className="text-sm text-stone-700">📝 {row.description}</div>
      )}
      {row.memo && <div className="text-xs text-stone-500">{row.memo}</div>}
      {row.receipt_image_url && (
        <img
          src={row.receipt_image_url}
          alt="レシート"
          className="max-h-40 rounded-lg border border-stone-200"
        />
      )}
      <div className="flex gap-2 pt-1">
        {!settledView && onSettle && (
          <button onClick={onSettle} className="btn-primary flex-1 text-sm">
            ✅ 精算した（返金済み）
          </button>
        )}
        {settledView && onUnsettle && (
          <button onClick={onUnsettle} className="btn-secondary flex-1 text-sm">
            ↩︎ 精算を取り消す
          </button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-sm text-red-500 underline px-2"
          >
            削除
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- 立替の登録フォーム ---------- */
function AddForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [payerMode, setPayerMode] = useState<string>("緒方");
  const [otherPayer, setOtherPayer] = useState("");
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [memo, setMemo] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const payer = payerMode === "その他" ? otherPayer.trim() : payerMode;

  const reset = () => {
    setDate(todayStr());
    setPayerMode("緒方");
    setOtherPayer("");
    setAmount(0);
    setDescription("");
    setMemo("");
    setPhoto(null);
  };

  const onPhoto = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert("画像が大きすぎます（20MB以下）");
      return;
    }
    try {
      setPhoto(await resizeImage(file));
    } catch (e: any) {
      alert("画像の処理に失敗: " + (e?.message || e));
    }
  };

  const save = async () => {
    if (!payer) return alert("立替者を入力してください");
    if (!amount || amount <= 0) return alert("金額を入力してください");
    setSaving(true);
    setMsg(null);
    try {
      const { error } = await supabase.from("advance_expenses").insert({
        date,
        payer,
        amount,
        description: description.trim() || null,
        memo: memo.trim() || null,
        receipt_image_url: photo,
        settled: false,
        created_by: "管理者",
      });
      if (error) throw error;
      setMsg("登録しました");
      reset();
      onAdded();
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) {
      alert("登録失敗: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary w-full">
        ＋ 立替を登録する
      </button>
    );
  }

  return (
    <div className="border border-brand/30 bg-brand/5 rounded-xl p-4 space-y-3">
      <h3 className="font-bold text-brand-dark">＋ 立替を登録</h3>

      <div>
        <label className="label">立替日</label>
        <input
          type="date"
          className="field"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div>
        <label className="label">立替者</label>
        <div className="flex gap-2 flex-wrap">
          {[...PRESET_PAYERS, "その他"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPayerMode(p)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border ${
                payerMode === p
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-stone-600 border-stone-300"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {payerMode === "その他" && (
          <input
            type="text"
            className="field mt-2"
            placeholder="名前を入力"
            value={otherPayer}
            onChange={(e) => setOtherPayer(e.target.value)}
          />
        )}
      </div>

      <div>
        <label className="label">金額</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
            ¥
          </span>
          <input
            type="number"
            inputMode="numeric"
            className="field pl-8 text-right text-xl font-bold"
            value={amount || ""}
            onChange={(e) =>
              setAmount(Math.max(0, parseInt(e.target.value || "0", 10)))
            }
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <label className="label">用途（何を立て替えたか）</label>
        <input
          type="text"
          className="field"
          placeholder="例：食材のまとめ買い"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className="label">メモ（任意）</label>
        <input
          type="text"
          className="field"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>

      <div>
        <label className="label">レシート写真（任意）</label>
        <input
          type="file"
          accept="image/*"
          className="text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPhoto(f);
          }}
        />
        {photo && (
          <img
            src={photo}
            alt="レシート"
            className="max-h-40 rounded-lg border border-stone-200 mt-2"
          />
        )}
      </div>

      {msg && (
        <div className="text-sm font-semibold rounded-xl px-3 py-2 bg-green-50 text-green-700 border border-green-200">
          ✅ {msg}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={saving}
          className="btn-secondary flex-1"
        >
          閉じる
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary flex-[2]"
        >
          {saving ? "登録中…" : "登録する"}
        </button>
      </div>
    </div>
  );
}
