"use client";

/**
 * 仕込み・調理マニュアル（2026-11-19 追加・牟田町店向け）。
 *
 * 中身は lib/cookingManual.ts の一覧だけ。ここは並べて見せるだけ。
 * 見せるのは「写真だけの日報のお店の端末（店主・スタッフ）」と「じゅんの端末」だけ
 * （lib/photoShopRole.ts の canViewManual）。手羽屋の数字はこの画面では一切読まない。
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { COOKING_MANUAL, MANUAL_GROUPS, type ManualBlock } from "@/lib/cookingManual";
import { currentShopScope } from "@/lib/keiri/readSource";
import { readOwnerDevice } from "@/lib/keiri/outreach";
import { canViewManual } from "@/lib/photoShopRole";

const GROUP_ICON: Record<string, string> = { 仕込み: "🔪", 調理: "🍳", そのほか: "📋" };

/** 作業が変わる小見出し。上に線と余白を置いて、カードの中で区切る（ChatGPTレビュー⑤） */
function SubTitle({ text }: { text: string }) {
  return <h3 className="mt-2 pt-3 border-t border-[#D1D5DB] text-lg font-bold text-[#222222]">{text}</h3>;
}

function Steps({ items, plain }: { items: { b: string; s?: string }[]; plain?: boolean }) {
  return (
    <ol className="space-y-4">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span
            className={
              plain
                ? "mt-2 w-3 h-3 rounded-full bg-orange-500 flex-none"
                : "w-9 h-9 rounded-full bg-orange-500 text-white font-bold grid place-items-center flex-none"
            }
          >
            {plain ? "" : i + 1}
          </span>
          <div className="pt-1 min-w-0">
            <p className="font-bold text-[18px] leading-snug text-[#222222]">{it.b}</p>
            {it.s && <p className="text-base font-medium leading-6 text-[#374151] mt-1">{it.s}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Block({ block, sectionId }: { block: ManualBlock; sectionId: string }) {
  switch (block.kind) {
    case "steps":
      return (
        <div className="space-y-2">
          {block.title && <SubTitle text={block.title} />}
          <Steps items={block.items} plain={sectionId === "cook-aji"} />
        </div>
      );
    case "table": {
      // 2列目が長い表（アレルギーなど）は、右寄せ・太字にしない
      const wide = block.rows.some((r) => (r[1] ?? "").length > 12);
      const right = block.head.length === 2 && !wide;
      return (
        <div className="space-y-1">
          {block.title && <SubTitle text={block.title} />}
          <table className="w-full text-[15px]">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} className={`text-xs font-normal text-stone-500 py-2 ${i > 0 && right ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-stone-200">
                  {r.map((c, ci) => (
                    <td
                      key={ci}
                      className={`py-2 align-top ${
                        right && ci === 1
                          ? "text-right font-bold pl-3"
                          : ci === 0
                            ? wide ? "pr-3 font-bold w-[38%]" : "pr-2"
                            : wide ? "" : "pr-2 whitespace-nowrap"
                      }`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "tips":
      return (
        <div className="space-y-1">
          {block.title && <SubTitle text={block.title} />}
          <ul className="list-disc pl-5 space-y-1 text-[15px]">
            {block.items.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      );
    case "mix":
      return (
        <div className="space-y-3">
          {block.rows.map((r) => (
            <div key={r.label} className="space-y-1">
              <p className="font-bold">{r.label}</p>
              <div className="flex h-10 rounded-xl overflow-hidden text-[13px] font-bold">
                {r.parts.map((p, i) => (
                  <span
                    key={p.name}
                    style={{ flex: p.ratio }}
                    className={`grid place-items-center px-1 text-center leading-tight ${
                      i === 0 ? "bg-orange-500 text-white" : "bg-orange-100 text-stone-800"
                    }`}
                  >
                    {p.name} {p.ratio}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case "flow":
      // ボタンに見えないよう、ひと続きの淡い帯にする。時間の数字だけ色を付ける（ChatGPTレビュー④）
      return (
        <div className="flex items-center justify-between gap-1 rounded-xl bg-[#FFF4E8] px-3 py-2.5 text-[15px] font-semibold text-[#374151] whitespace-nowrap">
          {block.parts.map((p, i) => (
            <div key={i} className="contents">
              {i > 0 && <span className="text-stone-400">→</span>}
              <span className="min-w-0">
                {p.label.split(/(\d+分)/).map((t, k) =>
                  /^\d+分$/.test(t) ? (
                    <span key={k} className="text-[#9A4100] font-bold">
                      {t}
                    </span>
                  ) : (
                    <span key={k}>{t}</span>
                  ),
                )}
              </span>
            </div>
          ))}
        </div>
      );
    case "note":
      return <p className="text-[15px] text-stone-600">{block.text}</p>;
    case "warn":
      return <p className="text-sm rounded-xl bg-amber-50 text-amber-800 px-3 py-2">{block.text}</p>;
    case "photos":
      return (
        <div className="grid grid-cols-3 gap-2">
          {block.items.map((p) => (
            <figure key={p.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/supplies/${p.id}.jpg`}
                alt={p.caption}
                loading="lazy"
                className="w-full aspect-[3/4] object-cover rounded-xl bg-stone-100"
              />
              <figcaption className="text-[13px] text-stone-600 leading-tight">{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      );
    case "check":
      return (
        <div className="space-y-2">
          <SubTitle text={block.title} />
          <ul className="space-y-2 text-[15px]">
            {block.items.map((t, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <span className="mt-1 w-[18px] h-[18px] rounded border-2 border-orange-500 flex-none" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

export default function ManualPage() {
  const [state, setState] = useState<"checking" | "ok" | "no">("checking");
  useEffect(() => {
    setState(canViewManual({ scope: currentShopScope(), ownerDevice: readOwnerDevice() }) ? "ok" : "no");
  }, []);

  if (state === "checking") {
    return (
      <main className="max-w-md mx-auto px-4 py-6">
        <p className="text-sm text-stone-500">読み込み中…</p>
      </main>
    );
  }
  if (state === "no") {
    return (
      <main className="max-w-md mx-auto px-4 py-6 space-y-3">
        <h1 className="text-xl font-bold">仕込み・調理マニュアル</h1>
        <p className="text-sm text-stone-600">この画面は、お店の合言葉を入れた端末だけで見られます。</p>
        <Link href="/" className="text-sm text-stone-500 underline">
          ← メニューへ
        </Link>
      </main>
    );
  }

  const groupId = (g: string) => `group-${MANUAL_GROUPS.indexOf(g as (typeof MANUAL_GROUPS)[number])}`;

  return (
    <main className="max-w-md mx-auto min-h-screen pb-16">
      <header className="px-4 pt-6 pb-3 space-y-2">
        <Link href="/" className="text-sm text-stone-500 underline">
          ← メニューへ
        </Link>
        <h1 className="text-2xl font-bold">仕込み・調理マニュアル</h1>
      </header>

      {/* 上に貼りつく切り替え。キッチンで片手でも押せる大きさ */}
      <nav
        aria-label="まとまり"
        className="sticky top-0 z-10 bg-stone-50/95 backdrop-blur border-b border-stone-200 px-4 py-2"
      >
        <div className="grid grid-cols-3 gap-2">
          {MANUAL_GROUPS.map((g) => (
            <a
              key={g}
              href={`#${groupId(g)}`}
              className="h-[52px] rounded-xl bg-white border border-stone-200 text-base font-bold grid place-items-center active:border-orange-500"
            >
              {GROUP_ICON[g]} {g}
            </a>
          ))}
        </div>
      </nav>

      <div className="px-4 space-y-8 pt-5">
        {MANUAL_GROUPS.map((g) => {
          const sections = COOKING_MANUAL.filter((s) => s.group === g);
          return (
            <section key={g} id={groupId(g)} className="scroll-mt-16 space-y-3">
              <div className="flex items-center gap-2 border-l-4 border-orange-500 pl-3">
                <h2 className="text-lg font-bold">
                  {GROUP_ICON[g]} {g}
                </h2>
                <span className="text-xs text-stone-400">{sections.length}こ</span>
              </div>
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" aria-label={`${g}の目次`}>
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="flex-none text-sm rounded-full bg-orange-50 text-orange-800 px-3 py-1.5"
                  >
                    {s.title}
                  </a>
                ))}
              </div>
              {sections.map((s) => (
                <article
                  key={s.id}
                  id={s.id}
                  className="scroll-mt-16 rounded-2xl bg-white border border-stone-200 p-4 shadow-sm space-y-4"
                >
                  <h3 className="text-xl font-bold">{s.title}</h3>
                  {s.keys && (
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${s.keys.length}, minmax(0, 1fr))` }}>
                      {s.keys.map((k) => (
                        <div key={k.label} className="rounded-xl bg-orange-50 py-2.5 px-1 text-center min-w-0">
                          {/* どちらを選ぶか決める言葉を先に、数字はその下（ChatGPTレビュー①） */}
                          <p className="text-sm font-semibold text-[#374151] leading-tight">{k.label}</p>
                          <p className={`${k.value.length >= 5 ? "text-[20px]" : "text-2xl"} font-bold text-[#9A4100] leading-tight whitespace-nowrap mt-1`}>
                            {k.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.blocks.map((b, i) => (
                    <Block key={i} block={b} sectionId={s.id} />
                  ))}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}
