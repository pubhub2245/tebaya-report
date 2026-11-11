/**
 * 「よその店のデータが見えないか」を、**本物の2軒目の行**で数える、ただ1か所のファイル
 * （2026-11-11・f3-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   分かれているかを外から確かめる窓口（/api/keiri/scopecheck）は、きょうまで
 *   **「居ないお店の番号（作り話）」**で読んで「0件でした＝分かれています」と答えていました。
 *   ところが居ないお店は、**分けるしくみが1つも動いていなくても必ず 0件**です。
 *   ＝ あの0件は「分かれている証拠」ではありませんでした。
 *
 *   2026-11-11 に、**本物の2軒目（写真だけの日報のお店）**が動き始めました。
 *   その店の番号は lib/photoShop.ts の一覧（＝コードの中）にあるので、
 *   倉庫の鍵が壊れていても（kp241）確かめられます。
 *   同じ月を2通りで読んで、**行が1つも混ざっていないこと**を数えます。
 *
 * ■ 何を数えるか（0 が正しい）
 *   ① 手羽屋として読んだのに、印のついた行が混ざっていた件数
 *   ② よその店として読んだのに、印が空の行（手羽屋の行）が混ざっていた件数
 *   ③ よその店として読んだのに、**別の**店の印の行が混ざっていた件数
 *   ④ 両方の読みに出てきた同じ行の件数
 *
 * ■ 正直に言うこと
 *   その月に本物の行が1件も無ければ、答えの強さは**作り話の番号と同じ**です。
 *   そのときは measuredAgainstRealRows を false にして、そう書きます。
 *   （「0件だったから合格」と読まれないようにするため）
 *
 * ■ 守ること
 *   ・金額・お店の名前・番号・連絡先・鍵の値は1文字も持ちません（件数と○×だけ）。
 *   ・手羽屋が毎日使う画面（日報・シフト・レジ・LINE）の中身は1行も変えていません。
 */

/** 読んだ行のうち、ここで見るのは「行の番号」と「どの店の印か」の2つだけ */
export type StampedRow = { id?: string | number | null; tenant_id?: string | null };

export type RealSeparation = {
  /** 本物の2軒目の行で数えられたか（false のときは作り話の番号と同じ強さ） */
  measuredAgainstRealRows: boolean;
  /** 手羽屋として読んだ行の件数 */
  tebayaRows: number;
  /** よその店として読んだ行の件数 */
  otherShopRows: number;
  /** ① 手羽屋の読みに混ざっていた「印つき」の行（0が正しい） */
  strayStampedInTebaya: number;
  /** ② よその店の読みに混ざっていた「印が空」の行（0が正しい） */
  strayTebayaInOtherShop: number;
  /** ③ よその店の読みに混ざっていた「別の店の印」の行（0が正しい） */
  strayWrongShopInOtherShop: number;
  /** ④ 両方の読みに出てきた同じ行（0が正しい） */
  overlap: number;
  /** 分かれているか。数えられないときは null（合格にも不合格にもしない） */
  separated: boolean | null;
  summary: string;
};

/** 行の番号を、見比べられる文字にする（番号が無い行は数に入れない） */
function idsOf(rows: StampedRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    const id = r?.id;
    if (id === null || id === undefined || id === "") continue;
    out.add(String(id));
  }
  return out;
}

const stampOf = (r: StampedRow): string | null => {
  const v = r?.tenant_id;
  return v === null || v === undefined || v === "" ? null : String(v);
};

/**
 * 2通りの読みを見比べて、混ざっていないかを数える。
 *
 * @param measurable 倉庫が読めているか。false なら separated は null にする
 * @param otherShopId よその店として読むときに使った番号（答えには出しません）
 */
export function calcRealSeparation(params: {
  measurable: boolean;
  tebaya: StampedRow[];
  otherShop: StampedRow[];
  otherShopId: string;
}): RealSeparation {
  const { measurable, tebaya, otherShop, otherShopId } = params;
  const want = String(otherShopId ?? "").trim().toLowerCase();

  const strayStampedInTebaya = tebaya.filter((r) => stampOf(r) !== null).length;
  const strayTebayaInOtherShop = otherShop.filter((r) => stampOf(r) === null).length;
  const strayWrongShopInOtherShop = otherShop.filter((r) => {
    const s = stampOf(r);
    return s !== null && s.toLowerCase() !== want;
  }).length;

  const mineIds = idsOf(tebaya);
  let overlap = 0;
  for (const id of idsOf(otherShop)) if (mineIds.has(id)) overlap += 1;

  const clean =
    strayStampedInTebaya === 0 &&
    strayTebayaInOtherShop === 0 &&
    strayWrongShopInOtherShop === 0 &&
    overlap === 0;

  const measuredAgainstRealRows = otherShop.length > 0;
  const separated: boolean | null = !measurable ? null : clean;

  return {
    measuredAgainstRealRows,
    tebayaRows: tebaya.length,
    otherShopRows: otherShop.length,
    strayStampedInTebaya,
    strayTebayaInOtherShop,
    strayWrongShopInOtherShop,
    overlap,
    separated,
    summary: summaryOf({ measurable, clean, measuredAgainstRealRows, tebaya, otherShop }),
  };
}

function summaryOf(p: {
  measurable: boolean;
  clean: boolean;
  measuredAgainstRealRows: boolean;
  tebaya: StampedRow[];
  otherShop: StampedRow[];
}): string {
  if (!p.measurable) {
    return (
      "いまは数えられませんでした（倉庫が読めていません）。" +
      "合格にも不合格にもしていません"
    );
  }
  if (!p.clean) {
    return (
      "混ざっています。手羽屋として読んだ行とよその店として読んだ行のどちらかに、" +
      "別の店のものが入っていました"
    );
  }
  if (!p.measuredAgainstRealRows) {
    return (
      `手羽屋として読むと ${p.tebaya.length}件、本物の2軒目として読むと 0件で、混ざりはありません。` +
      "ただし**その店の行がこの月にまだ1件も無い**ので、この0件は" +
      "「居ないお店の番号で読んだ0件」と同じ強さしかありません（分かれている証拠にはなりません）"
    );
  }
  return (
    `手羽屋として読むと ${p.tebaya.length}件、本物の2軒目として読むと ${p.otherShop.length}件。` +
    "どちらの読みにも相手の行は1件も入っておらず、同じ行が両方に出ることもありません" +
    "（本物の行で数えました）"
  );
}

/** その月の範囲（YYYY-MM-01 〜 月末）。日本時間で数える */
export function monthRangeJst(now: Date): { start: string; end: string; ym: string; label: string } {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
    ym: `${y}-${mm}`,
    label: `${y}年${m}月`,
  };
}
