"use client";

import { useMemo, useState } from "react";
import CashCountForm from "./CashCountForm";
import {
  calculateCashTotal,
  compareWithPrevious,
} from "@/lib/setupCheck/cashCalculator";
import {
  inferTeamUnit,
  getTeamMembers,
} from "@/lib/setupCheck/teamUnit";
import {
  STANDARD_CASH_AMOUNT,
  type CashCoinCounts,
  type SetupCheckRecord,
  type TodayShiftEntry,
} from "@/lib/setupCheck/types";

export type SetupCheckFormInitial = Partial<TodayShiftEntry> & {
  date: string;
};

export default function SetupCheckForm({
  initial,
  onCancel,
  onSubmitted,
}: {
  initial: SetupCheckFormInitial;
  onCancel: () => void;
  onSubmitted: (record: SetupCheckRecord) => void;
}) {
  const [location, setLocation] = useState(initial.location ?? "");
  const [staffName, setStaffName] = useState(initial.staff_name ?? "");
  const [teamUnit, setTeamUnit] = useState<1 | 2>(
    initial.team_unit ?? inferTeamUnit(initial.staff_name ?? ""),
  );
  const [coins, setCoins] = useState<CashCoinCounts>({});
  const [snsPosted, setSnsPosted] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerTotal = useMemo(() => calculateCashTotal(coins), [coins]);
  const prev = initial.previous_register_total ?? null;
  const compare = useMemo(
    () => compareWithPrevious(registerTotal, prev),
    [registerTotal, prev],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) {
      setError("店舗名を入力してください");
      return;
    }
    if (!staffName.trim()) {
      setError("担当スタッフ名を入力してください");
      return;
    }
    if (registerTotal === 0) {
      if (!confirm("レジ金額が¥0ですが送信しますか？")) return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup-check/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: initial.date,
          location: location.trim(),
          location_id: initial.location_id ?? null,
          staff_name: staffName.trim(),
          team_unit: teamUnit,
          register_coins: coins,
          sales_target: initial.sales_target ?? null,
          sns_posted: snsPosted,
          note,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "登録に失敗しました");
      }
      onSubmitted(json.data as SetupCheckRecord);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const teamMembers = getTeamMembers(teamUnit);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 出店情報 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold">出店情報</h2>
        <div>
          <label className="label">📅 日付</label>
          <input
            type="text"
            value={initial.date}
            disabled
            className="field bg-stone-100"
          />
        </div>
        <div>
          <label className="label">店舗</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="field"
            required
          />
        </div>
        <div>
          <label className="label">担当スタッフ</label>
          <input
            type="text"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            className="field"
            required
          />
        </div>
        <div>
          <label className="label">部隊（編集可）</label>
          <div className="grid grid-cols-2 gap-2">
            {[1, 2].map((u) => {
              const sel = teamUnit === u;
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setTeamUnit(u as 1 | 2)}
                  className={`rounded-xl py-2 font-bold border-2 ${
                    sel
                      ? "bg-brand text-white border-brand"
                      : "bg-white text-stone-700 border-stone-300"
                  }`}
                >
                  {u}番隊（{(u === 1 ? ["じゅん", "イデ"] : ["かずき", "なぎさ"]).join("・")}）
                </button>
              );
            })}
          </div>
          <p className="text-xs text-stone-500 mt-1">
            前回レジ金は選択した部隊から取得しています
          </p>
        </div>
        {initial.sales_target ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm">
            🎯 売上目標: <strong>¥{initial.sales_target.toLocaleString()}</strong>
          </div>
        ) : null}
      </section>

      {/* レジ金確認 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold">🪙 レジ金確認</h2>
        <p className="text-xs text-stone-500">
          標準額は¥{STANDARD_CASH_AMOUNT.toLocaleString()}（参考表示のみ・判定はしません）
        </p>
        <CashCountForm coins={coins} onChange={setCoins} />

        <div className="bg-stone-100 rounded-xl p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-stone-600">レジ合計</span>
            <span className="text-2xl font-bold text-brand-dark">
              ¥{registerTotal.toLocaleString()}
            </span>
          </div>

          {prev !== null ? (
            <div className="text-sm border-t border-stone-300 pt-2">
              <div className="flex justify-between text-stone-600">
                <span>
                  前回（{initial.previous_check_date} {teamUnit}番隊）
                </span>
                <span className="font-mono">¥{prev.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-stone-700">差分</span>
                {compare.diff === null ? (
                  <span className="text-stone-500">—</span>
                ) : compare.diff === 0 ? (
                  <span className="text-green-700 font-bold">
                    ±¥0（前回と一致）
                  </span>
                ) : (
                  <span
                    className={`font-bold ${
                      compare.diff > 0 ? "text-blue-700" : "text-red-700"
                    }`}
                  >
                    {compare.diff > 0 ? "+" : "-"}¥
                    {Math.abs(compare.diff).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-stone-500 border-t border-stone-300 pt-2">
              前回データなし（同部隊の初回チェック）
            </div>
          )}
        </div>
      </section>

      {/* 確認項目 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold">📋 確認項目</h2>
        <label className="flex items-center gap-3 cursor-pointer bg-stone-50 rounded-xl px-3 py-3">
          <input
            type="checkbox"
            checked={snsPosted}
            onChange={(e) => setSnsPosted(e.target.checked)}
            className="w-5 h-5"
          />
          <span className="text-sm">Instagram ストーリー投稿済み</span>
        </label>
      </section>

      {/* 備考 */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold">📝 備考（任意）</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="補足があれば記入"
          rows={3}
          className="field text-sm"
        />
      </section>

      {error && (
        <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
          ❌ {error}
        </div>
      )}

      <div className="flex gap-2 pb-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="btn-secondary flex-1"
        >
          ← 戻る
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary flex-[2]"
        >
          {submitting ? "⏳ 送信中…" : "登録してテキスト生成"}
        </button>
      </div>
    </form>
  );
}
