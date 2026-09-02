/**
 * 過去の経費のうち「レシート写真の自動読み取り（OCR）で入力された行」を見分けて、
 * 税抜のまま入っている金額の「修正案」を出すための計算。
 *
 * ■ なぜ必要か
 *   2026年4〜8月の経費のうち、OCRで入れた行は**税抜**で記録されています
 *   （読み取りの指示が消費税の行を除いていたため。→ CLAUDE.md 4-12）。
 *   手入力の行は、実際に払った額がそのまま入っているので**触りません**。
 *
 * ■ ここは「下見（修正案を出す）」だけ
 *   このファイルは本番のデータを1件も書き換えません。計算するだけです。
 *   実際の書き換えの手順は docs/keiri.md「税修正の実行手順」を参照。
 *
 * ■ 大事な考え方
 *   迷ったら「不明」に落として、修正案を出さない。
 *   **勝手に金額を作らないこと。** 人が確かめられるように一覧に残します。
 */

import { classifyExpense, normalizeText } from "./classify";
import type { BusinessTemplate, ExpenseItem } from "./types";
import type { ExpenseAccountKey } from "./accounts";

/** 判定の根拠 */
export type OcrEvidence =
  /** a: レシート写真がある（確実） */
  | "a"
  /** b: 説明がレシート読み取り特有の書式（ほぼ確実） */
  | "b"
  /**
   * c: 写真つきの行のすぐ後ろに並んでいる（手がかり止まり・確実ではない）
   *
   * ★データにもコードにも「OCRで入れた」という印（フラグや項目）はありません。
   *   ただし直す前のコードは、1枚のレシートから作られた行のうち
   *   **1行目だけに写真を付け、2行目以降は写真なし**で並べていました
   *   （app/report/page.tsx の handlePhoto）。
   *   なので「写真つきの行の直後に続く行」は同じレシートから来た可能性が高い。
   *   ただし現場の人が後から手で足した行も同じ位置に入るため、**確実ではありません**。
   *   だからこの根拠だけの行は「不明（要確認）」にして、自動修正の対象から外します。
   */
  | "c"
  /** どの根拠にも当たらない＝手入力とみなす */
  | "none";

/** 確度 */
export type Confidence = "確実" | "ほぼ確実" | "不明";

// ------------------------------------------------------------------
// (b) レシート読み取り特有の書式
// ------------------------------------------------------------------

/**
 * b1：単価の書き方。「3コ×単480」「（2コ×単798）」など。
 *
 * これはレジのレシートが印字する書式で、人がこの書き方をすることはまずない。
 * ★実データではこの書式の7件すべてが「単価×個数」ちょうど＝消費税ゼロだった。
 */
const RE_UNIT_PRICE = /単\s*\d{2,}/;

/**
 * b2：個数の「コ」。「2コ」「10コ」など。
 * レシートの数量欄の書き方。手入力は「×2」「2個」と書く。
 */
const RE_KO_COUNTER = /\d+\s*コ(?![ーン])/;

/**
 * b3：型番・規格の書き方。「DH-8001」「NF-4」「0-80AG」「P04」「#16」など。
 * レシートの商品名にそのまま入っている。
 */
const RE_MODEL_CODE = /[A-Za-z]{1,6}[-‐]?\d{2,}|#\d+|\d+[-‐]\d+[A-Za-z]/;

/**
 * b4：半角スペースを含む。
 *
 * レシートは「メーカー名 商品名 規格」を**半角スペース**で区切って印字する。
 * 現場の人は日本語で打つので、半角スペースはまず入らない（「、」や「（）」を使う）。
 *
 * ★実データ602件で確かめた：半角スペースを含む49通りは**すべて**レシートの商品行で、
 *   手入力の行は1件も含まれていなかった。だから単独で使える判定にしている。
 */
const RE_HALF_SPACE = / /;

/**
 * b5：アンダースコア。「透明ゴミ袋_45L厚手」のようにレシートの印字に出る。
 * 手入力では使われない。
 */
const RE_UNDERSCORE = /_/;

/**
 * b6：容量の規格。「25L」「80g」「1kg」「18m」など、数字＋単位。
 *
 * 単位はレシートに出るものだけに絞ってある。
 * 「本」「入」「円」「キロ」は手入力にも出るので**入れていない**
 * （「はし（150本入り）」「コピー50円×7」「片栗粉1キロ×3」を巻き込まないため）。
 * 短い言葉は手入力のことが多いので、10文字以上のときだけ使う。
 */
const RE_SPEC = /\d+(\.\d+)?\s*(kg|ml|cm|mm|[glmr]|枚)/i;

/**
 * 説明がレシート読み取り特有の書式かどうか。
 *
 * 判定は控えめにしてある（迷うくらいなら「手入力」とみなす）。
 * 手入力の行を間違って直してしまうより、直せない行が残るほうがましなため。
 */
export function looksLikeOcrText(description: string | null | undefined): boolean {
  const raw = (description ?? "").trim();
  if (!raw) return false;
  const t = normalizeText(raw);

  // 単価つき・「コ」つきは、それだけでレシートの書式
  if (RE_UNIT_PRICE.test(t)) return true;
  if (RE_KO_COUNTER.test(t)) return true;

  // 型番は、それだけでレシートの書式
  if (RE_MODEL_CODE.test(t)) return true;

  // 半角スペース・アンダースコアもレシートの印字（実データで確認済み）
  if (RE_HALF_SPACE.test(raw)) return true;
  if (RE_UNDERSCORE.test(raw)) return true;

  // 規格（25L・80g など）は、長い商品名と一緒のときだけ
  if (RE_SPEC.test(t) && raw.length >= 10) return true;

  return false;
}

// ------------------------------------------------------------------
// 税率の決め方
// ------------------------------------------------------------------

/**
 * 仕入（材料）でも「食品かどうか判断がつかない」もの。
 * 見つかったら税率を決めずに「不明」に落とす（自動修正しない）。
 *
 * - 酒類は軽減税率の対象外（10%）。「料理酒」は調味料なので食品（8%）。
 * - 「氷プレート」「ボトル」「ケース」などは飲食料品ではなく容器・道具のことがある。
 */
const UNCLEAR_IN_PURCHASE = [
  "ビール",
  "氷結",
  "発泡酒",
  "チューハイ",
  "ハイボール",
  "ワイン",
  "焼酎",
  "日本酒",
  "ケース",
  "プレート",
  "ボトル",
  "容器",
];

/** 「酒」を含むが料理酒（調味料）は食品なので除く */
function hasAlcoholWord(t: string): boolean {
  if (t.includes("料理酒")) return false;
  return t.includes("酒");
}

export type RateDecision = {
  /** 8 / 10 / null（決められない） */
  rate: 8 | 10 | null;
  /** どの科目に入れたか（参考） */
  account: ExpenseAccountKey;
  /** 決められなかった理由 */
  reason?: string;
};

/**
 * 税率を決める。
 *
 * - 仕入（材料）で食品 → 8%
 * - それ以外（消耗品費・車両費・雑費など） → 10%
 * - 判断がつかない品目 → null（自動修正の対象から外す）
 */
export function decideRate(
  description: string | null | undefined,
  template: BusinessTemplate,
): RateDecision {
  const { account, matched } = classifyExpense(description, template);
  const t = normalizeText(description);

  if (account === "purchase") {
    if (hasAlcoholWord(t))
      return { rate: null, account, reason: "酒類かもしれない（酒類は10%）" };
    for (const w of UNCLEAR_IN_PURCHASE) {
      if (t.includes(normalizeText(w)))
        return {
          rate: null,
          account,
          reason: `食品か容器・道具か分からない（「${w}」を含む）`,
        };
    }
    return { rate: 8, account };
  }

  // 雑費は「何か分からなかったもの」なので、税率も決めない
  if (account === "misc" && !matched)
    return { rate: null, account, reason: "科目が分からない（雑費）" };

  return { rate: 10, account };
}

// ------------------------------------------------------------------
// 1行ぶんの判定と修正案
// ------------------------------------------------------------------

export type ExpenseRowRef = ExpenseItem & {
  /** 何日の日報か */
  date: string;
  /** 出店場所 */
  location?: string | null;
  /** その日報の中で何番目の経費か（0から数える） */
  index: number;
};

export type FixProposal = {
  date: string;
  location: string;
  description: string;
  index: number;
  /** 元の金額 */
  before: number;
  /** 修正案の金額。出せないときは null */
  after: number | null;
  /** 修正案 − 元の金額 */
  diff: number | null;
  /** 使った税率（8 / 10）。写真ありで再OCR待ちのときや不明のときは null */
  rate: 8 | 10 | null;
  evidence: OcrEvidence;
  confidence: Confidence;
  /** 一覧に出す短い説明 */
  note: string;
};

/** 税率をかけて税込にする。1円未満は四捨五入 */
export function toTaxIncluded(amount: number, rate: 8 | 10): number {
  return Math.round((Number(amount) || 0) * (1 + rate / 100));
}

/**
 * 経費1行を見て、OCR由来かどうかと修正案を出す。
 *
 * - 写真がある行（a）＝確実。ただし修正額は「写真を読み直してレシートの合計に
 *   合わせる」のが正しいので、ここでは修正案を出さず「再OCR待ち」にする。
 * - 写真が無くて書式がレシート特有（b）＝ほぼ確実。科目から税率を決めて計算する。
 * - どちらでもない＝手入力とみなして**対象外**（null を返す）。
 */
export function proposeFix(
  row: ExpenseRowRef,
  template: BusinessTemplate,
): FixProposal | null {
  const description = (row.description ?? "").trim();
  const before = Number(row.amount) || 0;
  const base = {
    date: row.date,
    location: (row.location ?? "").trim(),
    description: description || "（説明なし）",
    index: row.index,
    before,
  };

  const hasPhoto = !!(row.receipt_image_url ?? "").trim();

  if (hasPhoto) {
    return {
      ...base,
      after: null,
      diff: null,
      rate: null,
      evidence: "a",
      confidence: "確実",
      note: "写真あり。レシートの合計を読み直してから直す（再OCR待ち）",
    };
  }

  if (!looksLikeOcrText(description)) return null; // 手入力とみなす → 触らない

  // 金額が0の行は直しても0のまま
  if (before === 0) {
    return {
      ...base,
      after: null,
      diff: null,
      rate: null,
      evidence: "b",
      confidence: "不明",
      note: "金額が0円のため直しようがない",
    };
  }

  const { rate, account, reason } = decideRate(description, template);
  if (rate === null) {
    return {
      ...base,
      after: null,
      diff: null,
      rate: null,
      evidence: "b",
      confidence: "不明",
      note: `税率を決められない：${reason ?? ""}`,
    };
  }

  const after = toTaxIncluded(before, rate);
  return {
    ...base,
    after,
    diff: after - before,
    rate,
    evidence: "b",
    confidence: "ほぼ確実",
    note: `${accountNoteOf(account)}なので${rate}%`,
  };
}

/**
 * 現場の人が必ず手で書く言葉。
 *
 * これらが出てきたら「写真つきの行の続き」はそこで終わりとみなす。
 * （レシートの商品行ではなく、スタッフが後から足した行だから）
 * こうしないと、日報の最後に足された「場代」「交通費」まで
 * 要確認の一覧に並んでしまい、見るのが大変になる。
 */
const HAND_TYPED_WORDS = [
  "場代",
  "場所代",
  "テナント料",
  "肉代",
  "手羽代",
  "交通費",
  "高速代",
  "有料道路",
  "ガソリン",
  "研修",
  "時給",
  "給与",
  "補填",
  "マイナス分",
  "検便",
  "雑費",
  "レンタル",
  "レジ袋",
];

/** 明らかに手入力の行か（写真つきの行の続きを、ここで打ち切る） */
export function looksHandTyped(description: string | null | undefined): boolean {
  const t = normalizeText(description);
  if (!t) return false;
  return HAND_TYPED_WORDS.some((w) => t.includes(normalizeText(w)));
}

/**
 * 日報1件ぶんの経費をまとめて見て、修正案を出す。
 *
 * 1行ずつの判定（proposeFix）に加えて、
 * 「写真つきの行の直後に並んでいる行」を**要確認**として拾う（根拠 c）。
 * 直す前のコードは1枚のレシートの1行目にだけ写真を付けていたため、
 * その後ろの行も同じレシートから来ている可能性が高いからです。
 *
 * ★根拠 c だけの行は確実ではないので、修正案は出しません（人が確かめる）。
 */
export function proposeFixesForReport(
  rows: ExpenseRowRef[],
  template: BusinessTemplate,
): FixProposal[] {
  const sorted = rows.slice().sort((a, b) => a.index - b.index);
  const out: FixProposal[] = [];
  let afterPhoto = false;

  for (const row of sorted) {
    const hasPhoto = !!(row.receipt_image_url ?? "").trim();
    const p = proposeFix(row, template);

    // 明らかに手入力の言葉が出たら、「写真つきの行の続き」はここで終わり
    if (!hasPhoto && looksHandTyped(row.description)) afterPhoto = false;

    if (p) {
      out.push(p);
    } else if (afterPhoto) {
      // 手入力に見えるが、写真つきの行の直後に並んでいる → 要確認
      out.push({
        date: row.date,
        location: (row.location ?? "").trim(),
        description: (row.description ?? "").trim() || "（説明なし）",
        index: row.index,
        before: Number(row.amount) || 0,
        after: null,
        diff: null,
        rate: null,
        evidence: "c",
        confidence: "不明",
        note: "写真つきの行の直後に並んでいる（同じレシートかもしれない）。人が確かめること",
      });
    }

    // 写真つきの行を見たら、そこから後ろは「同じレシートの続きかもしれない」
    if (hasPhoto) afterPhoto = true;
  }

  return out;
}

function accountNoteOf(account: ExpenseAccountKey): string {
  switch (account) {
    case "purchase":
      return "仕入（材料・食品）";
    case "supplies":
      return "消耗品費";
    case "vehicle":
      return "車両費";
    case "booth_fee":
      return "出店料";
    case "communication":
      return "通信費";
    default:
      return "その他";
  }
}
