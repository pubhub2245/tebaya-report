/**
 * 「本物の鍵が、よその名前の欄に入っていないか」を**言葉にする**ところ（f3-4・2026-10-29・kp267）。
 *
 * ■ なぜこの1枚が要るのか（やさしい説明）
 *   サーバー側の鍵の欄（SUPABASE_SERVICE_ROLE_KEY）には、いま**鍵ではないもの**が
 *   入っています（長さ約700文字・日本語が約450文字・改行が12個）。
 *   これは「貼る欄を間違えた」ようにも見えます。だとすると、**本物の鍵は
 *   よその欄に入っているかもしれません**。入っていれば、じゅんの1分を待たずに
 *   こちら側で レシート写真の置き場を閉められ（f3-4）、毎日の控えも戻ります。
 *
 * ■ ここには通信を入れません
 *   探すのは lib/supabaseServer.ts（鍵を扱う所は1か所という決まり：CLAUDE.md 4-10）。
 *   ここは**見立てを日本語にするだけ**なので、試験で言葉まで固定できます。
 *
 * ★名前だけを扱います。**鍵の値・合言葉・設定の中身は1文字も通しません。**
 */

import type { KeyCandidate } from "@/lib/supabaseServer";

export type KeyHuntReport = {
  /** 代わりに使える鍵が見つかったか */
  found: boolean;
  /** 見つかった名前（使えるものだけ）。値ではありません */
  usableNames: string[];
  /** 見つけたが使わないもの（理由つき） */
  skipped: { name: string; why: string }[];
  /** 画面と記録に出す1行 */
  headline: string;
};

/** 使わないと決めた理由を1行で言う（名前のほかは何も出さない） */
export function skipReason(c: KeyCandidate): string | null {
  if (c.publicName) {
    return "ブラウザにも配られる名前に入っているので使いません（すでに表に出てしまっている形です。別の欄に移して、この欄は消してください）";
  }
  if (c.secretStyle) {
    return "新しい形の秘密の鍵のようですが、どの倉庫のものか形だけでは確かめられないので使いません";
  }
  if (c.repaired) {
    return "全角を半角に直すと形は合いますが、公式の欄いがいでは直した値を使わないと決めているので使いません";
  }
  return null;
}

/**
 * 見つけた候補を、やさしい1行にまとめる。
 * `officialUsable` が true のとき（公式の欄が元気なとき）は、探す必要そのものがない。
 */
export function describeKeyHunt(
  candidates: KeyCandidate[],
  officialUsable: boolean,
): KeyHuntReport {
  const usableNames = candidates
    .filter((c) => c.usable && !c.publicName && !c.secretStyle)
    .map((c) => c.name);
  const skipped = candidates
    .map((c) => ({ name: c.name, why: skipReason(c) }))
    .filter((s): s is { name: string; why: string } => s.why !== null);

  if (officialUsable) {
    return {
      found: false,
      usableNames: [],
      skipped,
      headline: "公式の欄の鍵がそのまま使えています。よその欄を探す必要はありません",
    };
  }
  if (usableNames.length > 0) {
    return {
      found: true,
      usableNames,
      skipped,
      headline:
        `本物の鍵が、よその欄（${usableNames.join("・")}）に入っていました。` +
        "公式の欄が直るまで、こちらを使って動かします（鍵の値は1文字も出していません）",
    };
  }
  const tail =
    skipped.length > 0
      ? `（形が近いものは ${skipped.length} 件ありましたが、下の理由で使いません）`
      : "（鍵の形をしたものは1つもありませんでした）";
  return {
    found: false,
    usableNames: [],
    skipped,
    headline:
      "よその欄にも、この倉庫の鍵は入っていませんでした" +
      tail +
      "。＝ 鍵を貼り直すのは じゅんの1分（/keiri/key）しかありません",
  };
}
