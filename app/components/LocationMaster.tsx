"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";
import { boothFeeRuleText, type BoothFeeRule } from "@/lib/money";
import { RANK_ORDER, RANK_TARGET, RECENT_VISITS } from "@/lib/locationRank";
import {
  applyRankPlans,
  fetchRankHistory,
  planAllRankUpdates,
  type RankHistoryRow,
  type RankPlan,
} from "@/lib/locationRankUpdate";

/**
 * 出店場所マスタ管理（設定センター）。
 * locations テーブルの追加・編集・無効化。
 * ※削除はシフト等から参照されるため行わず、無効化(is_active)で運用。
 *
 * ★ランクは「直近8回の実績」から自動で決まる（→ lib/locationRank.ts）。
 *   日報が保存されるたび、その出店先だけ見直してここの値が書き換わる。
 *   お祭り・イベント枠のように毎回会場が違う出店先は「🔒 固定」を ON にすると
 *   自動判定の対象から外れる。
 */

type Loc = {
  id: number;
  name: string;
  rank: string | null;
  target: number | null;
  is_active: boolean;
  rank_locked: boolean | null;
  /** 出店料（場代）の決め方：none=なし / percent=売上の◯％ / fixed=定額 */
  booth_fee_type: string | null;
  booth_fee_rate: number | string | null;
  booth_fee_amount: number | null;
};

/** マスタの行から、表示用の決まりを作る */
const ruleOf = (r: Loc): BoothFeeRule =>
  r.booth_fee_type === "percent"
    ? { type: "percent", rate: Number(r.booth_fee_rate) || 0 }
    : r.booth_fee_type === "fixed"
      ? { type: "fixed", amount: Number(r.booth_fee_amount) || 0 }
      : { type: "none" };

const RANKS = RANK_ORDER;

export default function LocationMaster() {
  const [rows, setRows] = useState<Loc[]>([]);
  const [history, setHistory] = useState<Map<number, RankHistoryRow[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const [newName, setNewName] = useState("");
  const [newRank, setNewRank] = useState<string>("C");
  const [newTarget, setNewTarget] = useState(RANK_TARGET.C);
  const [saving, setSaving] = useState(false);

  // 一括判定（プレビュー → 反映）
  const [plans, setPlans] = useState<RankPlan[] | null>(null);
  const [judging, setJudging] = useState(false);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("locations")
      .select(
        "id, name, rank, target, is_active, rank_locked, booth_fee_type, booth_fee_rate, booth_fee_amount",
      )
      .order("is_active", { ascending: false })
      .order("name");
    if (error) flash("err", "読込エラー: " + error.message);
    setRows((data as Loc[]) ?? []);
    try {
      setHistory(await fetchRankHistory(5));
    } catch {
      // 履歴が読めなくてもマスタの編集はできるようにする
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!newName.trim()) return flash("err", "場所名を入力してください");
    setSaving(true);
    const { error } = await supabase.from("locations").insert({
      name: newName.trim(),
      rank: newRank,
      target: newTarget || 0,
      is_active: true,
    });
    setSaving(false);
    if (error) return flash("err", "追加失敗: " + error.message);
    setNewName("");
    setNewRank("C");
    setNewTarget(RANK_TARGET.C);
    flash("ok", "出店場所を追加しました");
    load();
  };

  const patch = async (row: Loc, changes: Partial<Loc>) => {
    const { error } = await supabase
      .from("locations")
      .update(changes)
      .eq("id", row.id);
    if (error) return flash("err", "更新失敗: " + error.message);
    load();
  };

  /** 直近の実績で全出店先のランクを判定する（まだ書き換えない） */
  const preview = async () => {
    setJudging(true);
    try {
      setPlans(await planAllRankUpdates());
    } catch (e: any) {
      flash("err", "判定に失敗: " + (e?.message || e));
    } finally {
      setJudging(false);
    }
  };

  /** プレビューの内容をマスタに反映する */
  const apply = async () => {
    if (!plans) return;
    const changes = plans.filter((p) => p.changed);
    if (changes.length === 0) {
      setPlans(null);
      return flash("ok", "変えるところはありませんでした");
    }
    if (
      !window.confirm(
        `${changes.length}件のランク／目標を書き換えます。よろしいですか？`,
      )
    )
      return;
    setJudging(true);
    try {
      const applied = await applyRankPlans(changes);
      setPlans(null);
      flash("ok", `${applied}件のランクを更新しました`);
      load();
    } catch (e: any) {
      flash("err", "更新に失敗: " + (e?.message || e));
    } finally {
      setJudging(false);
    }
  };

  const skipLabel = (p: RankPlan): string => {
    if (p.skipReason === "locked") return "🔒 固定（自動判定しない）";
    if (p.skipReason === "notEnoughData")
      return `データ不足（直近${p.sampleCount}回・3回未満）`;
    return "変更なし";
  };

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-brand-dark">📍 出店場所マスタ</h2>
      <p className="text-xs text-stone-500">
        出店場所の追加・ランク・目標の編集ができます。使わなくなった場所は「無効化」で隠せます（履歴は残ります）。
      </p>
      <p className="text-xs text-stone-500 leading-relaxed">
        ★ランクは
        <span className="font-bold">直近{RECENT_VISITS}回の平均売上</span>
        から自動で決まります（目標額の9割に届いた一番上のランク／
        {RECENT_VISITS}回のうち3回未満なら今のまま）。 日報が保存されるたびに、
        その出店先だけ見直されます。 お祭り・イベント枠のように毎回会場が違う
        出店先は「🔒 固定」を ON にしてください。
      </p>
      <p className="text-xs text-stone-500 leading-relaxed">
        ★出店料（場代）も、ここの決まりから
        <span className="font-bold">日報のSTEP5に自動で入ります</span>
        （売上の◯％ か 定額）。1円未満は切り捨て。
        いつもと違う金額のときは、現場で書き換えられます。
      </p>
      <p className="text-[11px] text-stone-400">
        目標額のめやす：
        {RANKS.map((r) => `${r} ${yen(RANK_TARGET[r])}`).join(" / ")}
      </p>

      {msg && (
        <div
          className={`text-sm font-semibold rounded-xl px-3 py-2 ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.kind === "ok" ? "✅" : "❌"} {msg.text}
        </div>
      )}

      {/* 直近の実績で一括判定 */}
      <div className="card space-y-3 bg-indigo-50 border border-indigo-200">
        <div className="font-bold text-indigo-800 text-sm">
          🔄 直近{RECENT_VISITS}回の実績でランクを見直す
        </div>
        <p className="text-xs text-indigo-700/80">
          先に「こう変わります」の一覧が出ます。中身を見てから反映してください。
        </p>
        <button
          onClick={preview}
          disabled={judging}
          className="btn-secondary w-full text-sm"
        >
          {judging ? "計算中…" : "変更予定を見る"}
        </button>

        {plans && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-indigo-800">
              変更予定 {plans.filter((p) => p.changed).length}件 ／ 全
              {plans.length}件
            </div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {plans.map((p) => (
                <div
                  key={p.locationId}
                  className={`text-xs rounded-lg px-2 py-1.5 ${
                    p.changed
                      ? "bg-white border border-indigo-300"
                      : "bg-white/50 text-stone-500"
                  }`}
                >
                  <span className="font-bold">{p.name}</span>{" "}
                  {p.changed ? (
                    <>
                      <span className="text-stone-500">
                        {p.currentRank ?? "—"}（{yen(p.currentTarget ?? 0)}）
                      </span>
                      {" → "}
                      <span className="font-bold text-indigo-700">
                        {p.newRank}（{yen(p.newTarget ?? 0)}）
                      </span>
                    </>
                  ) : (
                    <span>{skipLabel(p)}</span>
                  )}
                  <span className="block text-[10px] text-stone-400">
                    直近{p.sampleCount}回平均 {yen(p.average)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={apply}
                disabled={judging}
                className="btn-primary flex-1 text-sm"
              >
                この内容で反映する
              </button>
              <button
                onClick={() => setPlans(null)}
                className="btn-secondary text-sm"
              >
                やめる
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 追加フォーム */}
      <div className="card space-y-3 bg-brand/5 border border-brand/20">
        <div className="font-bold text-brand-dark text-sm">＋ 出店場所を追加</div>
        <div>
          <label className="label">場所名</label>
          <input
            className="field"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例：〇〇スーパー 前"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">ランク</label>
            <select
              className="field"
              value={newRank}
              onChange={(e) => {
                setNewRank(e.target.value);
                const t = RANK_TARGET[e.target.value as keyof typeof RANK_TARGET];
                if (t) setNewTarget(t);
              }}
            >
              {RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">売上目標</label>
            <input
              type="number"
              inputMode="numeric"
              className="field text-right"
              value={newTarget || ""}
              onChange={(e) =>
                setNewTarget(Math.max(0, parseInt(e.target.value || "0", 10)))
              }
            />
          </div>
        </div>
        <button onClick={add} disabled={saving} className="btn-primary w-full">
          {saving ? "追加中…" : "この場所を追加"}
        </button>
      </div>

      {/* 一覧 */}
      {loading ? (
        <p className="text-sm text-stone-500">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-400 py-4">出店場所がまだありません。</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const hist = history.get(r.id) ?? [];
            return (
              <div
                key={r.id}
                className={`card space-y-2 ${r.is_active ? "" : "opacity-50"}`}
              >
                <div className="font-bold text-stone-800">
                  {r.name}
                  {r.rank_locked && (
                    <span className="ml-2 text-xs text-indigo-600">
                      🔒 ランク固定
                    </span>
                  )}
                  {!r.is_active && (
                    <span className="ml-2 text-xs text-stone-400">（無効）</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="field w-auto py-1 text-xs"
                    value={r.rank ?? "C"}
                    onChange={(e) => patch(r, { rank: e.target.value })}
                  >
                    {RANKS.map((rk) => (
                      <option key={rk} value={rk}>
                        ランク{rk}
                      </option>
                    ))}
                  </select>
                  <label className="text-xs text-stone-500">目標 ¥</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="field w-28 text-right py-1"
                    defaultValue={r.target ?? 0}
                    onBlur={(e) => {
                      const v = Math.max(0, parseInt(e.target.value || "0", 10));
                      if (v !== (r.target ?? 0)) patch(r, { target: v });
                    }}
                  />
                  <button
                    onClick={() => patch(r, { is_active: !r.is_active })}
                    className="text-xs border border-stone-300 rounded-lg px-2 py-1 hover:bg-stone-50 ml-auto"
                  >
                    {r.is_active ? "無効化" : "有効化"}
                  </button>
                </div>

                {/* 自動判定の ON/OFF */}
                <label className="flex items-center gap-2 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={!!r.rank_locked}
                    onChange={(e) =>
                      patch(r, { rank_locked: e.target.checked })
                    }
                  />
                  🔒 ランクを固定する（自動判定しない・お祭り／イベント枠向け）
                </label>

                {/* 出店料（場代）の決まり */}
                <div className="flex items-center gap-2 flex-wrap border-t border-stone-100 pt-2">
                  <label className="text-xs text-stone-500">🏪 場代</label>
                  <select
                    className="field w-auto py-1 text-xs"
                    value={r.booth_fee_type ?? "none"}
                    onChange={(e) =>
                      patch(r, {
                        booth_fee_type: e.target.value,
                        // 使わない方の値は消して、あとで迷わないようにする
                        ...(e.target.value === "percent"
                          ? { booth_fee_amount: null }
                          : e.target.value === "fixed"
                            ? { booth_fee_rate: null }
                            : { booth_fee_rate: null, booth_fee_amount: null }),
                      })
                    }
                  >
                    <option value="none">なし（0円）</option>
                    <option value="percent">売上の◯％</option>
                    <option value="fixed">定額</option>
                  </select>
                  {r.booth_fee_type === "percent" && (
                    <>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        className="field w-20 text-right py-1"
                        defaultValue={Number(r.booth_fee_rate) || 0}
                        onBlur={(e) => {
                          const v = Math.max(0, Number(e.target.value || "0"));
                          if (v !== (Number(r.booth_fee_rate) || 0))
                            patch(r, { booth_fee_rate: v });
                        }}
                      />
                      <span className="text-xs text-stone-500">％</span>
                    </>
                  )}
                  {r.booth_fee_type === "fixed" && (
                    <>
                      <span className="text-xs text-stone-500">¥</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="field w-24 text-right py-1"
                        defaultValue={r.booth_fee_amount ?? 0}
                        onBlur={(e) => {
                          const v = Math.max(
                            0,
                            parseInt(e.target.value || "0", 10),
                          );
                          if (v !== (r.booth_fee_amount ?? 0))
                            patch(r, { booth_fee_amount: v });
                        }}
                      />
                    </>
                  )}
                  <span className="text-[11px] text-stone-400 ml-auto">
                    {boothFeeRuleText(ruleOf(r))}
                  </span>
                </div>

                {/* ランク履歴（直近5件） */}
                {hist.length > 0 && (
                  <div className="text-[11px] text-stone-500 space-y-0.5 border-t border-stone-100 pt-2">
                    <div className="font-bold text-stone-600">
                      ランク履歴（直近{hist.length}件）
                    </div>
                    {hist.map((h) => (
                      <div key={h.id}>
                        {h.changed_at.slice(0, 10)}　{h.old_rank ?? "—"} →{" "}
                        <span className="font-bold">{h.new_rank}</span>
                        　（直近{h.sample_count ?? 0}回平均 {yen(h.avg_sales ?? 0)}）
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
