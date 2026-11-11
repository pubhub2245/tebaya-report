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
        id: "mirin",
        name: "みりんタイプ",
        detail: "1800ml",
        use: "タレ",
        price: 248,
        priceTaxIn: 267,
      },
      {
        id: "mizuame",
        name: "水あめ（ボトル）",
        detail: "カンピー・270g",
        use: "タレ",
        price: 218,
        priceTaxIn: 235,
      },
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
