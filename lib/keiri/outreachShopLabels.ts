/**
 * 送り先8軒の**呼び名**だけを持つファイル（kp172）。
 *
 * ■ このファイルを取り込んでよいのは1か所だけ
 *   じゅんの端末にだけ出る帯（app/components/OwnerOutreachNudge.tsx）と、検算（tests/）です。
 *   **合言葉の要らない住所（/keiri/send）から取り込んではいけません。**
 *   取り込むと、画面に1文字も出さなくても、ブラウザに配られる中身に呼び名が入り、
 *   誰でも読める形になります（それが kp172 で見つかった抜けです）。
 *
 * ■ ここでも出さないもの
 *   ・**連絡先（LINEのID・メールアドレス）は1つも書かない。**
 *     画面に出す必要がなく、出せば端末を見た人に他人の連絡先が渡るため。
 *     誰がどれかは じゅんの手元（司令室の meta/keiri-line-message）にあります。
 *   ・**値段も書かない**（受け取る8軒は同じ出店先に出ている同業のため）
 *   戻り止めは tests/keiriOutreach.test.ts と tests/keiriOutreachNames.test.ts。
 */

import {
  OUTREACH_SHOP_ORDER,
  type OutreachShopId,
  isEmailOnly,
  nextShopId,
  remainingShopIds,
} from "./outreachShops";

/** 送り先1軒（画面に出す形） */
export type OutreachShop = {
  /** 控えに残す名前（変えると印が外れるので変えない） */
  id: OutreachShopId;
  /** 画面に出す呼び名。お店の種類だけ。連絡先は入れない */
  label: string;
  /** LINE で送れない相手にだけ付ける但し書き */
  note?: string;
};

/** id → 画面に出す呼び名 */
export const OUTREACH_SHOP_LABELS: Record<OutreachShopId, string> = {
  crepe: "クレープ",
  kaitenyaki: "回転焼き",
  tori: "鶏のお店",
  bistro: "ビストロ",
  kitchencar1: "キッチンカー（1軒目）",
  kitchencar2: "キッチンカー（2軒目）",
  houjin: "法人（複数台）",
  night: "夜の催事のお店",
};

/** LINE で送れない1軒に付ける但し書き */
export const OUTREACH_EMAIL_ONLY_NOTE = "この1軒はメールのみ";

/** 送り先8軒（並び順つき・呼び名つき） */
export const OUTREACH_SHOPS: readonly OutreachShop[] = OUTREACH_SHOP_ORDER.map(
  (s) => ({
    id: s.id,
    label: OUTREACH_SHOP_LABELS[s.id],
    ...(s.emailOnly ? { note: OUTREACH_EMAIL_ONLY_NOTE } : {}),
  }),
);

/** id から呼び名を引く（知らない id はそのまま返す） */
export function shopLabel(id: string): string {
  return OUTREACH_SHOP_LABELS[id as OutreachShopId] ?? id;
}

/** id から画面に出す1軒を作る */
export function shopOf(id: OutreachShopId): OutreachShop {
  return {
    id,
    label: OUTREACH_SHOP_LABELS[id],
    ...(isEmailOnly(id) ? { note: OUTREACH_EMAIL_ONLY_NOTE } : {}),
  };
}

/** まだ送っていないお店（呼び名つき） */
export function remainingShops(sent: readonly string[]): OutreachShop[] {
  return remainingShopIds(sent).map(shopOf);
}

/** 「今日の1軒」（呼び名つき）。残っていなければ null */
export function nextShop(sent: readonly string[]): OutreachShop | null {
  const id = nextShopId(sent);
  return id ? shopOf(id) : null;
}
