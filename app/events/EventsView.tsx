"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { applyTenantScope, TEBAYA_SCOPE } from "@/lib/tenantScope";
import TebayaOnlyGate from "@/app/components/TebayaOnlyGate";
import {
  boneHours,
  buildLineText,
  dateLabel,
  defaultDates,
  emptyPlan,
  estimateChicken,
  FRYER_LABEL,
  needsGasRefill,
  POWER_LABEL,
  prepLabel,
  recommendFryer,
  roundUpToBags,
  SALES_PRESETS,
  STATUS_LABEL,
  SUPPLIER_OPTIONS,
  type EventPlan,
  type Fryer,
  type PlanStatus,
  type Power,
} from "@/lib/eventPlan";

/** 今日（日本時間）の YYYY-MM-DD */
function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const STATUS_STYLE: Record<PlanStatus, string> = {
  planning: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-700",
  done: "bg-stone-200 text-stone-600",
};

const COLUMNS =
  "id,event_date,event_name,venue,venue_address,open_time,close_time,load_in,load_out," +
  "expected_sales,chicken_count,supplier,order_date,prep_date,prep_start,prep_end,staff_prep,staff_event," +
  "fryer,power,power_note,gas_refill,booth_fee,cautions,contact,memo,status";

/** 決まっていない大事な項目（カードに赤字で出す） */
function missingItems(p: EventPlan): string[] {
  const out: string[] = [];
  if (!p.chicken_count) out.push("発注本数");
  if (!p.staff_prep) out.push("骨抜きの担当");
  if (!p.staff_event) out.push("当日の担当");
  if (p.fryer === "undecided") out.push("フライヤー");
  if (p.power === "unknown") out.push("電源の有無");
  return out;
}

type PastSale = { date: string; location: string; sales_amount: number };

/**
 * イベント段取り（2026-10-21・f3-4）。
 *
 * ■ なぜ門を掛けるのか（やさしい説明）
 *   この画面が使う棚（event_plans）には「どのお店のものか」の印の欄が
 *   **まだありません**。そのため、経理パッケージを申し込んだお店のスタッフが
 *   この画面を開くと
 *   ・**手羽屋の段取り表**（発注本数・担当・注意点）がそのまま見える
 *   ・そのお店が入れた段取りが、**手羽屋の画面に混ざる**
 *   ・過去の売上の参考（daily_reports）も、手羽屋の売上が出る
 *   の3つが起きます。絞りようが無いので、出店予定（shifts）や現場の立替と
 *   同じ門（TebayaOnlyGate）で、手羽屋以外には開かないようにします。
 *
 * ■ 手羽屋への影響：ありません
 *   手羽屋は印が空（null）なので、今までどおり中身がそのまま出ます
 *   （門が控えを読むひと呼吸だけ「読み込み中…」と出ます）。
 *
 * ★ event_plans に印の欄を足したら、この門を外して
 *   ふつうに applyTenantScope で絞る形に直してください。
 */
export default function EventsView() {
  return (
    <TebayaOnlyGate title="🎪 イベント段取り">
      <EventsViewInner />
    </TebayaOnlyGate>
  );
}

function EventsViewInner() {
  const [plans, setPlans] = useState<EventPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [editing, setEditing] = useState<EventPlan | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [staffNames, setStaffNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("event_plans")
      .select(COLUMNS)
      .order("event_date", { ascending: true });
    if (e) {
      setError("段取り表を読み込めませんでした。時間をおいて開き直してください。");
      setPlans([]);
    } else {
      setPlans((data ?? []) as unknown as EventPlan[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // 担当の候補は、在籍中のスタッフだけ（退職した人は出さない）。
    // ★印は手羽屋（空）で固定する（2026-10-21・f3-4）。この画面は門の内側＝
    //   必ず手羽屋だが、絞りを書いておかないと、よその店の担当者名が混ざる
    //   書き方が1本 残り続ける（下の過去の売上の参考と同じ形にそろえた）。
    applyTenantScope<any>(
      supabase
        .from("staff_members")
        .select("name,is_active")
        .eq("is_active", true) as any,
      TEBAYA_SCOPE,
    ).then(({ data }: { data: { name: string }[] | null }) => {
      setStaffNames((data ?? []).map((r) => r.name));
    });
  }, [load]);

  const today = todayJst();
  const visible = useMemo(
    () => plans.filter((p) => showPast || (p.event_date >= today && p.status !== "done")),
    [plans, showPast, today]
  );

  async function copyText(p: EventPlan) {
    const text = buildLineText(p);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(p.id ?? null);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // コピーできない端末では、文章を出して手で選んでもらう
      window.prompt("この文章をコピーしてLINEに貼ってください", text);
    }
  }

  if (editing) {
    return (
      <PlanForm
        initial={editing}
        staffNames={staffNames}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    );
  }

  return (
    <main className="max-w-md mx-auto px-4 py-6 min-h-screen">
      <Link href="/" className="text-sm text-stone-500 underline">
        ← メニューへ
      </Link>
      <h1 className="text-xl font-bold mt-3 mb-1">🎪 イベント段取り</h1>
      <p className="text-xs text-stone-500 mb-4">
        決まったイベントごとに、鳥の発注・骨抜き・フライヤー・電源・注意点をまとめます。
        「LINE用の文をコピー」を押して、スタッフのLINEに貼ってください。
      </p>

      <button
        type="button"
        onClick={() => setEditing(emptyPlan(today))}
        className="w-full h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow mb-4"
      >
        ＋ 新しいイベントの段取りを作る
      </button>

      <label className="flex items-center gap-2 text-sm text-stone-600 mb-3">
        <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
        終わったイベントも見る
      </label>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <p className="text-sm text-stone-500">これからのイベントの段取りはまだありません。</p>
      )}

      <div className="space-y-4">
        {visible.map((p) => {
          const missing = missingItems(p);
          const bags = p.chicken_count ? roundUpToBags(p.chicken_count) : null;
          return (
            <div key={p.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-stone-500">{dateLabel(p.event_date)}</p>
                  <p className="font-bold text-lg leading-tight">{p.event_name}</p>
                  {p.venue && <p className="text-xs text-stone-500">{p.venue}</p>}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>

              <dl className="mt-3 text-sm space-y-1">
                <Row label="🐔 発注">
                  {p.chicken_count
                    ? `${p.chicken_count}本` +
                      (bags && bags.pieces === p.chicken_count ? `（2kg×${bags.bags}袋）` : "")
                    : "未定"}
                  {` ／ ${p.supplier} ／ ${dateLabel(p.order_date)}まで`}
                </Row>
                <Row label="🔪 骨抜き">
                  {prepLabel(p)} ／ {p.staff_prep || "担当未定"}
                </Row>
                <Row label="👤 当日">{p.staff_event || "担当未定"}</Row>
                <Row label="🔥 フライヤー">
                  {FRYER_LABEL[p.fryer]}
                  {p.gas_refill ? "（ガス補充あり）" : ""}
                </Row>
                <Row label="🔌 電源">
                  {POWER_LABEL[p.power]}
                  {p.power_note ? `（${p.power_note}）` : ""}
                </Row>
              </dl>

              {missing.length > 0 && (
                <p className="mt-2 text-xs text-red-600">まだ決まっていない：{missing.join("・")}</p>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyText(p)}
                  className="h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold"
                >
                  {copiedId === p.id ? "✅ コピーしました" : "LINE用の文をコピー"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="h-11 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-bold"
                >
                  編集する
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-stone-500">{label}</dt>
      <dd className="flex-1">{children}</dd>
    </div>
  );
}

/* ──────────────── 入力フォーム ──────────────── */

function PlanForm({
  initial,
  staffNames,
  onCancel,
  onSaved,
}: {
  initial: EventPlan;
  staffNames: string[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [p, setP] = useState<EventPlan>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState<PastSale[] | null>(null);

  function set<K extends keyof EventPlan>(key: K, value: EventPlan[K]) {
    setP((prev) => ({ ...prev, [key]: value }));
  }
  const text = (key: keyof EventPlan) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    set(key, (e.target.value === "" ? null : e.target.value) as never);
  const num = (key: keyof EventPlan) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^\d]/g, "");
    set(key, (v === "" ? null : Number(v)) as never);
  };

  const est = estimateChicken(p.expected_sales);
  const rec = recommendFryer(p.expected_sales, p.power);

  /**
   * 売上の想定を変えたら、発注本数もいっしょに入れ直す（1本230円・袋の単位に切り上げ）。
   * 本数はそのあと手で直してもよい。売上をもう一度変えると、また計算し直す。
   */
  function setSales(v: number | null) {
    const e = estimateChicken(v);
    setP((prev) => ({ ...prev, expected_sales: v, chicken_count: v ? e.pieces : prev.chicken_count }));
  }

  function applyFryer() {
    setP((prev) => ({ ...prev, fryer: rec.fryer, gas_refill: needsGasRefill(rec.fryer) }));
  }

  function resetDates() {
    const d = defaultDates(p.event_date);
    setP((prev) => ({ ...prev, order_date: d.orderDate, prep_date: d.prepDate }));
  }

  // 同じ会場の過去の売上（参考）。日報は売上と場所だけ読む（経費の明細は読まない → CLAUDE.md 4-2）
  async function lookupPast() {
    const key = (p.event_name || p.venue || "").trim();
    if (!key) {
      setPast([]);
      return;
    }
    const word = key.split(/[\s　]/)[0];
    const q = supabase
      .from("daily_reports")
      .select("date,location,sales_amount")
      .ilike("location", `%${word}%`)
      .order("date", { ascending: false })
      .limit(5);
    const { data } = await applyTenantScope(q, TEBAYA_SCOPE);
    setPast((data ?? []) as PastSale[]);
  }

  async function save() {
    if (!p.event_name.trim()) {
      setError("イベント名を入れてください");
      return;
    }
    if (!p.event_date) {
      setError("開催日を入れてください");
      return;
    }
    setSaving(true);
    setError(null);
    const { id, ...row } = p;
    const payload = { ...row, event_name: p.event_name.trim(), updated_at: new Date().toISOString() };
    const res = id
      ? await supabase.from("event_plans").update(payload).eq("id", id)
      : await supabase.from("event_plans").insert(payload);
    setSaving(false);
    if (res.error) {
      setError("保存できませんでした。通信を確かめて、もう一度押してください。");
      return;
    }
    await onSaved();
  }

  const input = "w-full h-11 rounded-xl border border-stone-300 px-3 text-base";
  const area = "w-full rounded-xl border border-stone-300 px-3 py-2 text-base";

  return (
    <main className="max-w-md mx-auto px-4 py-6 min-h-screen">
      <button type="button" onClick={onCancel} className="text-sm text-stone-500 underline">
        ← 一覧へ戻る（保存しない）
      </button>
      <h1 className="text-xl font-bold mt-3 mb-4">{p.id ? "段取りを編集" : "新しい段取り"}</h1>

      <Section title="いつ・どこで">
        <Field label="開催日">
          <input type="date" className={input} value={p.event_date} onChange={(e) => set("event_date", e.target.value)} />
        </Field>
        <Field label="イベント名">
          <input className={input} value={p.event_name} onChange={(e) => set("event_name", e.target.value)} placeholder="例：まるまる朝市" />
        </Field>
        <Field label="会場">
          <input className={input} value={p.venue ?? ""} onChange={text("venue")} placeholder="例：まちなか広場" />
        </Field>
        <Field label="住所">
          <input className={input} value={p.venue_address ?? ""} onChange={text("venue_address")} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="営業開始">
            <input type="time" className={input} value={(p.open_time ?? "").slice(0, 5)} onChange={text("open_time")} />
          </Field>
          <Field label="営業終了">
            <input type="time" className={input} value={(p.close_time ?? "").slice(0, 5)} onChange={text("close_time")} />
          </Field>
          <Field label="搬入開始">
            <input type="time" className={input} value={(p.load_in ?? "").slice(0, 5)} onChange={text("load_in")} />
          </Field>
          <Field label="搬出開始">
            <input type="time" className={input} value={(p.load_out ?? "").slice(0, 5)} onChange={text("load_out")} />
          </Field>
        </div>
      </Section>

      <Section title="売上の想定と鳥の発注">
        <Field label="売上の想定（円）">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {SALES_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSales(v)}
                className={`h-10 rounded-lg text-sm font-bold border ${
                  p.expected_sales === v
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                {v / 10000}万円
              </button>
            ))}
          </div>
          <input
            inputMode="numeric"
            className={input}
            value={p.expected_sales ?? ""}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "");
              setSales(v === "" ? null : Number(v));
            }}
            placeholder="ほかの金額は直接入れる（例：35000）"
          />
        </Field>
        <button type="button" onClick={lookupPast} className="text-sm text-blue-700 underline mb-2">
          同じ場所の過去の売上を見る
        </button>
        {past && (
          <div className="text-xs bg-stone-50 rounded-lg p-2 mb-3">
            {past.length === 0
              ? "過去の日報は見つかりませんでした"
              : past.map((r) => (
                  <p key={r.date + r.location}>
                    {dateLabel(r.date)} {r.location}：{(r.sales_amount ?? 0).toLocaleString()}円
                  </p>
                ))}
          </div>
        )}
        {p.expected_sales ? (
          <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-sm mb-3">
            <p>
              🐔 {p.expected_sales.toLocaleString()}円 ÷ 230円 ＝ 約{Math.ceil(p.expected_sales / 230)}本
              → 発注 {est.pieces}本（2kg×{est.bags}袋＝{est.kg}kg）
            </p>
            <p>🔪 骨抜き 約{boneHours(p.chicken_count ?? est.pieces)}時間</p>
          </div>
        ) : null}
        <Field label="発注本数（売上の想定から自動。手で直してもOK）">
          <input inputMode="numeric" className={input} value={p.chicken_count ?? ""} onChange={num("chicken_count")} />
          {p.chicken_count ? (
            <p className="text-xs text-stone-500 mt-1">
              2kg（30本）の袋で {roundUpToBags(p.chicken_count).bags}袋
              {roundUpToBags(p.chicken_count).pieces !== p.chicken_count ? "（袋の数に合わせると端数が出ます）" : ""}
            </p>
          ) : null}
        </Field>
        <Field label="発注先">
          <OptionOrOther
            value={p.supplier}
            options={SUPPLIER_OPTIONS}
            placeholder="発注先を入れる"
            onChange={(v) => set("supplier", v ?? "")}
            allowEmpty={false}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="発注日">
            <input type="date" className={input} value={p.order_date ?? ""} onChange={text("order_date")} />
          </Field>
          <Field label="骨抜き・仕込み日">
            <input type="date" className={input} value={p.prep_date ?? ""} onChange={text("prep_date")} />
          </Field>
        </div>
        <button type="button" onClick={resetDates} className="text-sm text-blue-700 underline">
          開催日から入れ直す（発注は4日前・仕込みは前日）
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Field label="仕込み開始（なくてもOK）">
            <input type="time" className={input} value={(p.prep_start ?? "").slice(0, 5)} onChange={text("prep_start")} />
          </Field>
          <Field label="仕込み終了（なくてもOK）">
            <input type="time" className={input} value={(p.prep_end ?? "").slice(0, 5)} onChange={text("prep_end")} />
          </Field>
        </div>
        <p className="text-xs text-stone-500">予定：{prepLabel(p)}</p>
      </Section>

      <Section title="誰が">
        <Field label="骨抜き・仕込みの担当">
          <OptionOrOther
            value={p.staff_prep}
            options={staffNames}
            placeholder="名前を入れる"
            onChange={(v) => set("staff_prep", v)}
          />
        </Field>
        <Field label="当日の担当">
          <OptionOrOther
            value={p.staff_event}
            options={staffNames}
            placeholder="名前を入れる（2人なら「じゅん・イデ」）"
            onChange={(v) => set("staff_event", v)}
          />
        </Field>
      </Section>

      <Section title="フライヤー・電源・ガス">
        <Field label="電源">
          <Choice<Power>
            value={p.power}
            options={["yes", "no", "unknown"]}
            label={(v) => POWER_LABEL[v]}
            onChange={(v) => set("power", v)}
          />
        </Field>
        <Field label="電源のメモ">
          <input className={input} value={p.power_note ?? ""} onChange={text("power_note")} placeholder="例：1店舗1,500Wまで・500円" />
        </Field>
        <Field label="フライヤー">
          <Choice<Fryer>
            value={p.fryer}
            options={["gas", "electric", "undecided"]}
            label={(v) => FRYER_LABEL[v]}
            onChange={(v) => setP((prev) => ({ ...prev, fryer: v, gas_refill: needsGasRefill(v) }))}
          />
        </Field>
        <p className="text-xs text-stone-600">
          おすすめ：{FRYER_LABEL[rec.fryer]}（{rec.reason}）
          {p.fryer !== rec.fryer && (
            <button type="button" onClick={applyFryer} className="ml-2 text-blue-700 underline">
              おすすめにする
            </button>
          )}
        </p>
        <Field label="ガスの補充">
          <Choice<"yes" | "no">
            value={p.gas_refill ? "yes" : "no"}
            options={["yes", "no"]}
            label={(v) => (v === "yes" ? "必要" : "不要")}
            onChange={(v) => set("gas_refill", v === "yes")}
          />
        </Field>
      </Section>

      <Section title="お金・注意点・連絡先">
        <Field label="出店料（円）">
          <input inputMode="numeric" className={input} value={p.booth_fee ?? ""} onChange={num("booth_fee")} />
        </Field>
        <Field label="注意点（1行に1つ）">
          <textarea rows={4} className={area} value={p.cautions ?? ""} onChange={text("cautions")} />
        </Field>
        <Field label="主催・問い合わせ先">
          <input className={input} value={p.contact ?? ""} onChange={text("contact")} />
        </Field>
        <Field label="メモ">
          <textarea rows={2} className={area} value={p.memo ?? ""} onChange={text("memo")} />
        </Field>
        <Field label="状態">
          <Choice<PlanStatus>
            value={p.status}
            options={["planning", "confirmed", "done"]}
            label={(v) => STATUS_LABEL[v]}
            onChange={(v) => set("status", v)}
          />
        </Field>
      </Section>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-lg shadow mb-10"
      >
        {saving ? "保存中…" : "保存する"}
      </button>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-bold text-stone-500 mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // label ではなく div にしている：選択ボタンを包んだ label の文字を押すと、
    // 1つめのボタンが勝手に押されてしまうため。
    <div className="block">
      <span className="block text-xs text-stone-600 mb-1">{label}</span>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: T[];
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`flex-1 h-10 rounded-lg text-sm font-bold border ${
            value === o ? "bg-orange-500 text-white border-orange-500" : "bg-white text-stone-600 border-stone-300"
          }`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

/**
 * 選択肢から選ぶ。無ければ「その他」を選んで手で入れる（担当・発注先など）。
 * value が選択肢に無い値なら、最初から「その他」として開く。
 */
function OptionOrOther({
  value,
  options,
  placeholder,
  onChange,
  allowEmpty = true,
}: {
  value: string | null;
  options: string[];
  placeholder: string;
  onChange: (v: string | null) => void;
  allowEmpty?: boolean;
}) {
  const OTHER = "__other__";
  const isOther = !!value && !options.includes(value);
  const [other, setOther] = useState(isOther);
  const selectValue = other ? OTHER : value ?? "";
  return (
    <div className="space-y-2">
      <select
        className="w-full h-11 rounded-xl border border-stone-300 px-3 text-base bg-white"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) {
            setOther(true);
            onChange(isOther ? value : null);
          } else {
            setOther(false);
            onChange(v === "" ? null : v);
          }
        }}
      >
        {allowEmpty && <option value="">未定</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>その他（入力する）</option>
      </select>
      {other && (
        <input
          className="w-full h-11 rounded-xl border border-stone-300 px-3 text-base"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        />
      )}
    </div>
  );
}
