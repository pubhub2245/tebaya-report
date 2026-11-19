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

function Steps({ items, plain }: { items: { b: string; s?: string }[]; plain?: boolean }) {
  return (
    <ol className="space-y-3">
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
            <p className="font-bold text-[17px] leading-snug">{it.b}</p>
            {it.s && <p className="text-sm text-stone-500">{it.s}</p>}
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
          {block.title && <h3 className="text-sm font-bold text-stone-500">{block.title}</h3>}
          <Steps items={block.items} plain={sectionId === "cook-aji"} />
        </div>
      );
    case "table": {
      // 2列目が長い表（アレルギーなど）は、右寄せ・太字にしない
      const wide = block.rows.some((r) => (r[1] ?? "").length > 12);
      const right = block.head.length === 2 && !wide;
      return (
        <div className="space-y-1">
          {block.title && <h3 className="text-sm font-bold text-stone-500">{block.title}</h3>}
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
          {block.title && <h3 className="text-sm font-bold text-stone-500">{block.title}</h3>}
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
      return (
        <div className="flex items-stretch gap-1.5 text-[13px] font-bold text-center">
          {block.parts.map((p, i) => (
            <div key={i} className="contents">
              {i > 0 && <span className="self-center text-stone-400">→</span>}
              <span
                style={{ flex: p.size }}
                className={`min-w-0 rounded-xl py-2.5 px-1 grid place-items-center leading-tight ${
                  p.hot ? "bg-orange-500 text-white" : "bg-orange-100 text-stone-800"
                }`}
              >
                {p.label}
              </span>
            </div>
          ))}
        </div>
      );
    case "note":
      return <p className="text-sm text-stone-500">{block.text}</p>;
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
              <figcaption className="text-xs text-stone-500 leading-tight">{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      );
    case "check":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-stone-500">{block.title}</h3>
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

  return (
    <main className="max-w-md mx-auto px-4 py-6 min-h-screen space-y-5">
      <div className="space-y-3">
        <Link href="/" className="text-sm text-stone-500 underline">
          ← メニューへ
        </Link>
        <h1 className="text-2xl font-bold">仕込み・調理マニュアル</h1>
        <nav className="flex flex-wrap gap-2" aria-label="目次">
          {COOKING_MANUAL.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-sm font-bold rounded-full bg-white border border-stone-200 px-3 py-1.5"
            >
              {s.title}
            </a>
          ))}
        </nav>
      </div>

      {MANUAL_GROUPS.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="text-xs font-bold tracking-widest text-stone-500">{g}</h2>
          {COOKING_MANUAL.filter((s) => s.group === g).map((s) => (
            <article
              key={s.id}
              id={s.id}
              className="scroll-mt-3 rounded-2xl bg-white border border-stone-200 p-4 shadow-sm space-y-4"
            >
              <h3 className="text-xl font-bold">{s.title}</h3>
              {s.keys && (
                <div className="grid grid-cols-3 gap-2">
                  {s.keys.map((k) => (
                    <div key={k.label} className="rounded-xl bg-orange-50 py-2 px-1 text-center min-w-0">
                      <p className="text-lg font-bold text-orange-700 leading-tight whitespace-nowrap">{k.value}</p>
                      <p className="text-[11px] text-stone-500 leading-tight mt-0.5">{k.label}</p>
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
      ))}
    </main>
  );
}
