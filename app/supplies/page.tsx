"use client";

/**
 * 使う備品・材料の一覧（2026-11-11 追加・2026-11-19 お店が足せるように）。
 * 買い出しのときに、写真で「どれを買えばいいか」を確かめるためのページ。
 *
 * ・はじめからある品物は lib/supplies.ts の一覧（写真は public/supplies/）。
 * ・お店が画面から足した品物は倉庫の photo_shop_supplies（そのお店の分だけ読む）。
 * ・足せるのは写真だけの日報のお店の端末（店主・スタッフ）。消せるのは店主の端末だけ、足した品物だけ。
 * ・混ぜ方と入力の確かめは lib/supplies.ts（tests/supplies.test.ts）。
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { usePhotoShop } from "@/app/components/PhotoShopHome";
import { supabase } from "@/lib/supabase";
import { applyTenantScope, tenantStamp } from "@/lib/tenantScope";
import { resizeImage } from "@/lib/imageResize";
import { uploadReceiptOrKeep } from "@/lib/receiptStorage";
import { canSeeShopMoney } from "@/lib/photoShopRole";
import {
  ADDED_GROUP,
  SUPPLY_GROUPS,
  SUPPLY_PHOTO_DATE,
  checkNewSupply,
  mergeSupplies,
  supplyCount,
  supplyGroupTitles,
  type Supply,
  type SupplyRow,
} from "@/lib/supplies";

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;
const field = "w-full h-12 rounded-xl border-2 border-stone-200 px-3 text-base focus:border-orange-500 outline-none";

export default function SuppliesPage() {
  const { checking, shop, role } = usePhotoShop();
  const [rows, setRows] = useState<SupplyRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shop) return;
    const { data, error } = await applyTenantScope<any>(
      supabase.from("photo_shop_supplies").select("id, group_title, name, detail, use_for, price_tax_in, photo") as any,
      shop.tenantId,
    ).order("created_at", { ascending: true });
    if (error) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setRows((data as SupplyRow[]) ?? []);
  }, [shop]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = mergeSupplies(SUPPLY_GROUPS, shop ? rows : []);
  const [y, m, d] = SUPPLY_PHOTO_DATE.split("-").map(Number);
  const canDelete = !!shop && canSeeShopMoney(role);

  const remove = async (item: Supply) => {
    const rowId = item.id.replace(/^added-/, "");
    const { error } = await applyTenantScope<any>(
      supabase.from("photo_shop_supplies").delete().eq("id", rowId) as any,
      shop!.tenantId,
    );
    setConfirmId(null);
    if (!error) load();
  };

  return (
    <main className="max-w-md mx-auto px-4 py-6 min-h-screen space-y-5">
      <div>
        <Link href="/" className="text-sm text-stone-500 underline">
          ← メニューへ
        </Link>
        <h1 className="text-xl font-bold mt-3">使う備品・材料（{supplyCount(groups)}点）</h1>
        <p className="text-xs text-stone-500">
          はじめからある品物の値段は {y}年{m}月{d}日に撮った棚札のものです。いまの値段とは違うことがあります。
        </p>
      </div>

      {!checking && shop && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full h-14 rounded-2xl bg-orange-500 active:bg-orange-700 text-white text-lg font-bold"
        >
          ＋ 新しい品物を登録する
        </button>
      )}
      {shop && adding && (
        <AddForm
          tenantId={shop.tenantId}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {loadError && <p className="text-sm text-red-600">お店で足した品物を読めませんでした。電波を確かめて開き直してください。</p>}

      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-sm font-bold text-stone-500">{group.title}</h2>
          {group.items.map((item) => (
            <article key={item.id} className="flex gap-3 rounded-2xl bg-white border border-stone-200 p-3 shadow-sm">
              {item.photo || !item.added ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.photo ?? `/supplies/${item.id}.jpg`}
                  alt={item.name}
                  width={96}
                  height={128}
                  loading="lazy"
                  className="w-24 h-32 object-cover rounded-xl bg-stone-100 flex-none"
                />
              ) : (
                <div className="w-24 h-32 rounded-xl bg-stone-100 flex-none grid place-items-center text-xs text-stone-400">
                  写真なし
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-bold leading-snug">{item.name}</p>
                {item.detail && <p className="text-xs text-stone-500">{item.detail}</p>}
                {item.use && <p className="text-sm text-stone-700">使いみち：{item.use}</p>}
                {item.priceTaxIn !== undefined && (
                  <p className="text-sm font-bold text-orange-700">
                    税込 {yen(item.priceTaxIn)}
                    {item.price !== undefined && <span className="font-normal text-stone-500">（本体 {yen(item.price)}）</span>}
                  </p>
                )}
                {item.added && canDelete && (
                  confirmId === item.id ? (
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => remove(item)} className="h-9 px-3 rounded-lg bg-red-600 text-white text-sm font-bold">
                        消す
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} className="h-9 px-3 rounded-lg border border-stone-300 text-sm">
                        やめる
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmId(item.id)} className="text-xs text-stone-400 underline pt-1">
                      この品物を一覧から消す
                    </button>
                  )
                )}
              </div>
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}

function AddForm({ tenantId, onCancel, onSaved }: { tenantId: string; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [use, setUse] = useState("");
  const [price, setPrice] = useState("");
  const [group, setGroup] = useState(ADDED_GROUP);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await resizeImage(file));
    } catch {
      setError("写真を読み込めませんでした。別の写真で試してください。");
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkNewSupply({ name, detail, use, price });
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    const photoValue = photo ? await uploadReceiptOrKeep(photo, "supplies", tenantId) : null;
    const { error: err } = await supabase.from("photo_shop_supplies").insert({
      ...tenantStamp(tenantId),
      group_title: group,
      name: name.trim(),
      detail: detail.trim() || null,
      use_for: use.trim() || null,
      price_tax_in: price.trim() ? Number(price.trim()) : null,
      photo: photoValue,
    });
    setSaving(false);
    if (err) return setError("登録できませんでした。電波を確かめてもう一度押してください。");
    onSaved();
  };

  return (
    <form onSubmit={save} className="rounded-2xl bg-white border-2 border-orange-200 p-4 space-y-3">
      <h2 className="text-lg font-bold">新しい品物を登録する</h2>
      <label className="block space-y-1">
        <span className="text-sm font-bold">写真（あると買い間違えない）</span>
        <input type="file" accept="image/*" onChange={pick} className="block w-full text-sm" />
        {photo && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={photo} alt="登録する品物の写真" className="w-24 h-32 object-cover rounded-xl" />
        )}
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-bold">品物の名前（必須）</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：片栗粉 1kg" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-bold">メーカー・容量</span>
        <input className={field} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="例：火乃国・北海道産" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-bold">使いみち</span>
        <input className={field} value={use} onChange={(e) => setUse(e.target.value)} placeholder="例：手羽先の衣" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-bold">値段（税込・円）</span>
        <input className={field} value={price} onChange={(e) => setPrice(e.target.value.trim())} inputMode="numeric" placeholder="例：429" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-bold">どこに並べるか</span>
        <select className={field} value={group} onChange={(e) => setGroup(e.target.value)}>
          {supplyGroupTitles().map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 h-12 rounded-xl bg-orange-500 active:bg-orange-700 disabled:opacity-50 text-white font-bold"
        >
          {saving ? "登録しています…" : "登録する"}
        </button>
        <button type="button" onClick={onCancel} className="h-12 px-4 rounded-xl border border-stone-300">
          やめる
        </button>
      </div>
    </form>
  );
}
