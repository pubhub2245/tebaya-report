/**
 * 出店場所の名前を、ここ1か所にまとめたファイル。
 *
 * ■ なぜ作ったか
 *   同じ場所の名前が、アプリの中で**4か所**にバラバラに書かれていた。
 *     ① 日報の選択肢（コードに直書き）      … 「ながやま 三股店」
 *     ② 出店場所マスタ（locations テーブル） … 「ながやま三股」
 *     ③ 分析画面の名寄せ表                  … 「ながやま三股店」
 *     ④ 照合用の別名表                      … また別
 *   日報の選択肢に①と②の両方が並んでいたため、スタッフがどちらを選んだかで
 *   名前が変わり、**同じ場所が別々の店として数えられていた**。
 *   実際、151件の日報に35通りの書き方があり、28件はマスタに繋がっていなかった。
 *
 * ■ これからのルール（日当と同じ考え方）
 *   **出店場所マスタ（locations テーブル）が正。**
 *   - 日報の選択肢はマスタからだけ作る（コードに一覧を書かない）。
 *   - 場所を足す・直すときは管理者ページのマスタを直す。コードは触らない。
 *   - 昔の日報は書き換えない。集計するときにこのファイルで名前を揃える（名寄せ）。
 *
 * ■ 名寄せ（なよせ）とは
 *   「ながやま 三股店」「ながやま三股店」「三股」を、
 *   ぜんぶ「ながやま三股」という1つの名前にまとめること。
 *   郵便物の宛名が少し違っても同じ家に届くようにするのと同じ。
 */

/** 名寄せの結果として使う正式名。出店場所マスタ（locations.name）と同じ表記にする */
export const CANONICAL = {
  nagayamaMimata: "ながやま三股",
  nagayamaWakaba: "ながやま若葉",
  nagayamaShibita: "ながやま志比田",
  nagayamaYamada: "ながやま山田",
  nagayamaTohoku: "ながやま都北",
  nagayamaTakao: "ながやま鷹尾",
  pasioTakajo: "PASIO高城",
  pasioHayasuzu: "PASIO早鈴",
  pasioShibita: "PASIO志比田",
  pasioTakao: "PASIO鷹尾",
  mangaSoko: "マンガ倉庫",
  aeon: "イオンモール",
  nishimuta: "ニシムタ",
  azHayato: "AZ隼人",
  hiroseMarche: "ヒロセマルシェ",
  nikuru: "ニクルの朝市",
  marumaru: "まるまる朝市",
  bigOpus: "BIG OPUS",
  acoop: "Aコープ木花",
} as const;

/** 比較用のキーを作る。空白・「店」・「@…」などの飾りを落として揃える */
export function normalizeKey(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .replace(/[\r\n\t]+/g, "")
    .replace(/[\s　]+/g, "")
    .replace(/[（(]\s*店頭\s*[）)]\s*$/g, "")
    .replace(/店頭$/g, "")
    .replace(/[＠@].*$/g, "")
    .replace(/都城駅前$/g, "")
    .replace(/都城店$/g, "")
    .replace(/店$/g, "")
    .toLowerCase();
}

/** 2つの場所の名前が（書き方の違いを許して）同じ場所か */
export function sameLocation(a: string, b: string): boolean {
  return canonicalLocationName(a) === canonicalLocationName(b);
}

type Rule = {
  /** すべて含まれていれば一致 */
  all: string[];
  /** どれかが含まれていれば一致（省略可） */
  any?: string[];
  canonical: string;
};

/**
 * 名寄せのルール。上から順に見て、最初に当てはまったものを採用する。
 *
 * ★「志比田」「鷹尾」は、ながやま系とPASIO系の**両方に同じ地名がある**ので、
 *   先に「ながやま付き」を判定してから、PASIO系を判定する。順番を入れ替えないこと。
 */
const RULES: Rule[] = [
  { all: ["三股"], canonical: CANONICAL.nagayamaMimata },
  { all: ["若葉"], canonical: CANONICAL.nagayamaWakaba },
  { all: ["山田"], canonical: CANONICAL.nagayamaYamada },
  { all: ["都北"], canonical: CANONICAL.nagayamaTohoku },

  // 志比田：ながやま系が先
  { all: ["志比田", "ながやま"], canonical: CANONICAL.nagayamaShibita },
  {
    all: ["志比田"],
    any: ["PASIO", "Pasio", "pasio", "パシオ"],
    canonical: CANONICAL.pasioShibita,
  },

  // 鷹尾（たかお）：ながやま系が先。PASIOの「たかお店」もここに入る
  { all: ["鷹尾", "ながやま"], canonical: CANONICAL.nagayamaTakao },
  {
    all: ["鷹尾"],
    any: ["PASIO", "Pasio", "pasio", "パシオ"],
    canonical: CANONICAL.pasioTakao,
  },
  {
    all: ["たかお"],
    any: ["PASIO", "Pasio", "pasio", "パシオ"],
    canonical: CANONICAL.pasioTakao,
  },

  // 高城（たかじょう）は鷹尾（たかお）とは別の場所
  { all: ["高城"], canonical: CANONICAL.pasioTakajo },
  { all: ["早鈴"], canonical: CANONICAL.pasioHayasuzu },

  { all: ["マンガ倉庫"], canonical: CANONICAL.mangaSoko },
  { all: ["イオン"], canonical: CANONICAL.aeon },
  { all: ["ニシムタ"], canonical: CANONICAL.nishimuta },
  { all: ["ヒロセ"], canonical: CANONICAL.hiroseMarche },
  { all: [], any: ["AZ", "Az", "az", "隼人", "はやと"], canonical: CANONICAL.azHayato },
  { all: [], any: ["にくる", "ニクル"], canonical: CANONICAL.nikuru },
  { all: ["まるまる"], canonical: CANONICAL.marumaru },
  { all: [], any: ["BIG OPUS", "BIGOPUS", "ビッグオーパス"], canonical: CANONICAL.bigOpus },
  { all: [], any: ["Aコープ", "aコープ", "ａコープ"], canonical: CANONICAL.acoop },
];

/**
 * 場所の名前を正式名に揃える。
 *
 * どのルールにも当てはまらないものは、**前後の空白だけ整えてそのまま返す**。
 * お祭りや単発のイベント（「高鍋祭り」など）は1回ずつ別物なので、
 * 無理にまとめない方が正しいため。
 */
export function canonicalLocationName(raw: string | null | undefined): string {
  if (!raw) return "";
  const name = raw.trim();
  if (!name) return "";

  for (const rule of RULES) {
    if (!rule.all.every((kw) => name.includes(kw))) continue;
    if (rule.any && rule.any.length > 0) {
      if (!rule.any.some((kw) => name.includes(kw))) continue;
    }
    return rule.canonical;
  }
  return name;
}

/**
 * イベント・単発の出店かどうか。
 * これらは出店回数が少なく平均も暴れるので、A〜Dの自動ランク判定から外す。
 */
export function isEventLocation(name: string): boolean {
  const keywords = ["イベント", "朝市", "BIG OPUS", "OPUS", "マルシェ", "祭"];
  return keywords.some((k) => name.includes(k));
}
