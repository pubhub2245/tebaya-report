/**
 * 使う備品・材料の一覧（2026-11-11 追加・牟田町店向け）。
 *
 * LINE グループのアルバム「使用備品一覧」（2026-04-02・写真15枚）を写したもの。
 * 買い出しのときに「どれを買えばいいか」を写真で確かめるための一覧。
 *
 * ★値段は**写真を撮った日の棚札の値段**（本体＝税抜／税込）。いまの値段とは違うことがある。
 *   写真から読めなかった値段は入れていない（数字を作らない）。
 * ★足す・直すときはこの一覧を直す。写真は public/supplies/ に置く。
 */

export type Supply = {
  /** 写真のファイル名（public/supplies/<id>.jpg） */
  id: string;
  name: string;
  /** メーカー・容量など、棚で見分けるための言葉 */
  detail: string;
  /** 何に使うか */
  use: string;
  /** 本体価格（税抜・円）。写真から読めなかったものは無し */
  price?: number;
  /** 税込価格（円） */
  priceTaxIn?: number;
  /** 写真の住所。無ければ public/supplies/<id>.jpg（はじめからある品物） */
  photo?: string;
  /** お店が画面から足した品物なら true（消せるのはこれだけ） */
  added?: boolean;
};

export type SupplyGroup = { title: string; items: Supply[] };

export const SUPPLY_PHOTO_DATE = "2026-04-02";

export const SUPPLY_GROUPS: SupplyGroup[] = [
  {
    title: "味つけ",
    items: [
      {
        id: "ajishio-kosho",
        name: "味塩こしょう 荒挽き黒こしょう",
        detail: "ダイショー・210g（ボトル）",
        use: "手羽先の塩味",
        price: 228,
        priceTaxIn: 246,
      },
      {
        id: "ajishio-kosho-refill",
        name: "味塩こしょう 荒挽き黒こしょう（詰替用）",
        detail: "ダイショー・115g",
        use: "手羽先の塩味（補充）",
        price: 128,
        priceTaxIn: 138,
      },
      {
        id: "onion-powder",
        name: "オニオンパウダー",
        detail: "GS BRAND（銀色の缶）",
        use: "手羽先の塩味（味塩こしょう8：オニオンパウダー2）",
      },
      {
        id: "ajishio",
        name: "アジシオ（袋）",
        detail: "味の素・300g",
        use: "のり塩",
        price: 198,
        priceTaxIn: 213,
      },
      { id: "aonori", name: "青のり", detail: "フタバ", use: "のり塩" },
      {
        id: "butter-shoyu",
        name: "シェイクポテトシーズニング バター醤油",
        detail: "マコーミック。ポテト100gに小さじ1強（3g）",
        use: "ポテトのバター醤油味",
      },
    ],
  },
  {
    title: "タレ・餃子の種",
    items: [
      {
        id: "torigara",
        name: "鶏がらスープの素",
        detail: "徳用・200g",
        use: "餃子の種",
        price: 278,
        priceTaxIn: 300,
      },
      {
        id: "shoga",
        name: "おろし生しょうが",
        detail: "源清田・230g（大きいチューブ）",
        use: "餃子の種",
        price: 218,
        priceTaxIn: 235,
      },
    ],
  },
  {
    title: "揚げもの",
    items: [
      {
        id: "canola",
        name: "キャノーラ油",
        detail: "1500g",
        use: "揚げ油",
        price: 398,
        priceTaxIn: 429,
      },
      {
        id: "potato",
        name: "フライドポテト シューストリングカット",
        detail: "Potato Kitchen・1kg（冷凍）",
        use: "ポテト",
      },
    ],
  },
  {
    title: "備品",
    items: [
      {
        id: "slip",
        name: "お会計票",
        detail: "セイワサンギョウ・1冊100枚",
        use: "注文の記録（日報で写真に撮る伝票）",
        price: 88,
        priceTaxIn: 96,
      },
      {
        id: "polybag",
        name: "ポリ袋 Lサイズ",
        detail: "390（仕上巾255）× 480mm",
        use: "持ち帰り用の袋",
      },
      {
        id: "bulb",
        name: "耐振電球 110V・200W",
        detail: "アサヒ・クリア・口金E26（ハンズマン）",
        use: "照明",
        price: 1137,
        priceTaxIn: 1250,
      },
    ],
  },
];

/** 一覧の件数（テストと画面の見出し用） */
export function supplyCount(groups: SupplyGroup[] = SUPPLY_GROUPS): number {
  return groups.reduce((s, g) => s + g.items.length, 0);
}

/** 画面から足すときに選べる「まとまり」 */
export const ADDED_GROUP = "お店で足したもの";
export function supplyGroupTitles(groups: SupplyGroup[] = SUPPLY_GROUPS): string[] {
  return [...groups.map((g) => g.title), ADDED_GROUP];
}

/** 倉庫の1行（photo_shop_supplies） */
export type SupplyRow = {
  id: string;
  group_title: string | null;
  name: string | null;
  detail: string | null;
  use_for: string | null;
  price_tax_in: number | null;
  photo: string | null;
};

/** 新しく足す品物の入力を確かめる。問題があれば理由を返す（無ければ null） */
export function checkNewSupply(input: { name: string; detail?: string; use?: string; price?: string }): string | null {
  const name = input.name.trim();
  if (!name) return "品物の名前を入れてください。";
  if (name.length > 60) return "名前は60文字までにしてください。";
  if ((input.detail ?? "").trim().length > 120) return "メーカー・容量は120文字までにしてください。";
  if ((input.use ?? "").trim().length > 60) return "使いみちは60文字までにしてください。";
  const p = (input.price ?? "").trim();
  if (p && !/^\d{1,7}$/.test(p)) return "値段は半角の数字（円）だけで入れてください。";
  return null;
}

/**
 * はじめからある一覧に、お店が足した品物を混ぜる。
 * 選んだまとまりの最後に足す。知らないまとまり名なら「お店で足したもの」に入れる。
 * 名前の無い行は数字を作らず飛ばす。
 */
export function mergeSupplies(base: SupplyGroup[], rows: SupplyRow[]): SupplyGroup[] {
  const groups = base.map((g) => ({ title: g.title, items: [...g.items] }));
  const extra: SupplyGroup = { title: ADDED_GROUP, items: [] };
  for (const r of rows) {
    const name = (r.name ?? "").trim();
    if (!name) continue;
    const item: Supply = {
      id: `added-${r.id}`,
      name,
      detail: (r.detail ?? "").trim(),
      use: (r.use_for ?? "").trim(),
      priceTaxIn: typeof r.price_tax_in === "number" ? r.price_tax_in : undefined,
      photo: r.photo ?? undefined,
      added: true,
    };
    const target = groups.find((g) => g.title === r.group_title) ?? extra;
    target.items.push(item);
  }
  return extra.items.length ? [...groups, extra] : groups;
}
