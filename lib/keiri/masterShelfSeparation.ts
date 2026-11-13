/**
 * 「手羽屋として読むと、よその店の行が出てこないか」を、**いま本物の行がある棚**で
 * 数えるところ（2026-11-13・f3-4）。**計算だけ**（倉庫は触りません・金額は1円も読みません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   分かれているかの確かめは、向きが2つあります。
 *     ① よその店として読むと、手羽屋の行が出てこないか
 *     ② 手羽屋として読むと、よその店の行が出てこないか
 *   きょうまで、②は「**牟田町店が日報を1枚でも出した日**に数えられます」と答えてきました
 *   （lib/keiri/realTenantSeparation.ts）。日報の棚には、よその店の行がまだ1件も無いからです。
 *
 *   ところが**日報いがいの棚には、よその店の本物の行がもう入っています**。
 *   出店場所・担当者・商品と単価の3つ（選択肢の棚）です。
 *   ＝ ②は きょう すでに数えられます。日報を待つ必要はありません。
 *   （この3つは、いまブラウザに配られている公開の鍵でそのまま読めてしまう棚でもあります。
 *   　そちらは貼り紙⑬で閉まります。ここで見るのは**アプリが読むときに絞れているか**です。）
 *
 * ■ 何を数えるか（0 が正しい）
 *   棚ごとに、手羽屋として読んだ行と、よその店として読んだ行を見比べます。
 *     ① 手羽屋の読みに混ざっていた「印つき」の行
 *     ② よその店の読みに混ざっていた「印が空」の行（手羽屋の行）
 *     ③ よその店の読みに混ざっていた「別の店の印」の行
 *     ④ 両方の読みに出てきた同じ行
 *   数え方は日報とまったく同じものを使います（calcRealSeparation）。
 *   ＝ 数え方を2つ持たないので、片方だけ直して食い違う事故が起きません。
 *
 * ■ 正直に言うこと
 *   ・読めなかった棚は「漏れていない」に寄せません（数に入れず unreadable に数えます）。
 *   ・よその店の行が1件も無い棚は、②の証拠になりません（作り話の番号で読んだ0件と同じ強さ）。
 *     1つでも**本物の行がある棚**で混ざりが0のときだけ、②を「確かめた」と言います。
 *   ・ここで分かるのは**アプリが読むときの絞り**だけです。公開の鍵で直に読む道（棚の鍵）は
 *     ここでは見ていません（そちらは /api/keiri/copies）。
 *
 * ■ 守ること
 *   金額・お店の名前・番号・連絡先・鍵の値は1文字も持ちません（件数と○×だけ）。
 *   手羽屋が毎日使う画面（日報・シフト・レジ・LINE）の中身は1行も変えていません。
 */

import { calcRealSeparation, type StampedRow } from "./realTenantSeparation";

/** 1つの棚を2通りで読んだ結果（読めなかったときは readable: false） */
export type MasterShelfRead = {
  table: string;
  label: string;
  /** 2通りとも読めたか。片方でも読めなければ false */
  readable: boolean;
  /** 手羽屋として読んだ行（番号と印だけ） */
  tebaya: StampedRow[];
  /** よその店として読んだ行（番号と印だけ） */
  otherShop: StampedRow[];
};

/** 棚1つぶんの数え結果 */
export type MasterShelfCount = {
  table: string;
  label: string;
  readable: boolean;
  tebayaRows: number;
  otherShopRows: number;
  strayStampedInTebaya: number;
  strayTebayaInOtherShop: number;
  strayWrongShopInOtherShop: number;
  overlap: number;
  /** 混ざりが無いか。読めなければ null */
  clean: boolean | null;
  /** この棚で②（手羽屋として読むと よその店の行が出ない）を本物の行で確かめられたか */
  provenTebayaHidesOtherShop: boolean;
  note: string;
};

export type MasterShelfSeparation = {
  /** 1つでも読めた棚があるか。無ければ合格にも不合格にもしない */
  measurable: boolean;
  shelves: MasterShelfCount[];
  /** 読めた棚の数 */
  measured: number;
  /** 読めなかった棚の名前 */
  unreadable: string[];
  /** よその店の本物の行があった棚の数 */
  shelvesWithRealRows: number;
  /** よその店の本物の行の合計件数 */
  otherShopRows: number;
  /** 混ざりの合計（4つとも 0 が正しい） */
  strayRows: number;
  /** 読めた棚がぜんぶ混ざり0か。1本も読めなければ null */
  clean: boolean | null;
  /** ②を本物の行で確かめられたか */
  provenTebayaHidesOtherShop: boolean;
  summary: string;
  note: string;
};

/**
 * 棚ごとに数えて、1つにまとめる。
 *
 * @param otherShopId よその店として読むときに使った番号（答えには出しません）
 */
export function calcMasterShelfSeparation(params: {
  shelves: MasterShelfRead[];
  otherShopId: string;
}): MasterShelfSeparation {
  const { shelves, otherShopId } = params;

  const counts: MasterShelfCount[] = shelves.map((s) => {
    if (!s.readable) {
      return {
        table: s.table,
        label: s.label,
        readable: false,
        tebayaRows: 0,
        otherShopRows: 0,
        strayStampedInTebaya: 0,
        strayTebayaInOtherShop: 0,
        strayWrongShopInOtherShop: 0,
        overlap: 0,
        clean: null,
        provenTebayaHidesOtherShop: false,
        note: `${s.label}の棚は読めませんでした（混ざっていないとも、混ざっているとも言えません）`,
      };
    }
    const r = calcRealSeparation({
      measurable: true,
      tebaya: s.tebaya,
      otherShop: s.otherShop,
      otherShopId,
    });
    const clean = r.separated === true;
    return {
      table: s.table,
      label: s.label,
      readable: true,
      tebayaRows: r.tebayaRows,
      otherShopRows: r.otherShopRows,
      strayStampedInTebaya: r.strayStampedInTebaya,
      strayTebayaInOtherShop: r.strayTebayaInOtherShop,
      strayWrongShopInOtherShop: r.strayWrongShopInOtherShop,
      overlap: r.overlap,
      clean,
      // ★この棚に**よその店の本物の行がある**ときだけ、②を確かめたと言う
      provenTebayaHidesOtherShop: clean && r.otherShopRows > 0,
      note: noteOf(s.label, clean, r.otherShopRows, r.tebayaRows),
    };
  });

  const readable = counts.filter((c) => c.readable);
  const measurable = readable.length > 0;
  const unreadable = counts.filter((c) => !c.readable).map((c) => c.label);
  const otherShopRows = readable.reduce((a, c) => a + c.otherShopRows, 0);
  const shelvesWithRealRows = readable.filter((c) => c.otherShopRows > 0).length;
  const strayRows = readable.reduce(
    (a, c) =>
      a +
      c.strayStampedInTebaya +
      c.strayTebayaInOtherShop +
      c.strayWrongShopInOtherShop +
      c.overlap,
    0,
  );
  const clean: boolean | null = !measurable ? null : readable.every((c) => c.clean === true);
  const provenTebayaHidesOtherShop = clean === true && shelvesWithRealRows > 0;

  return {
    measurable,
    shelves: counts,
    measured: readable.length,
    unreadable,
    shelvesWithRealRows,
    otherShopRows,
    strayRows,
    clean,
    provenTebayaHidesOtherShop,
    summary: summaryOf({
      measurable,
      clean,
      shelvesWithRealRows,
      otherShopRows,
      measured: readable.length,
      unreadable,
    }),
    note:
      "ここで見ているのは、**アプリが読むときに お店ごとに絞れているか**だけです。" +
      "ブラウザに配られている公開の鍵で棚を直に読む道は、ここでは見ていません" +
      "（そちらは /api/keiri/copies・貼り紙⑬で閉まります）。" +
      "読むのは行の番号と「どの店の印か」の2つだけで、名前・金額・連絡先は1文字も読んでいません",
  };
}

function noteOf(label: string, clean: boolean, otherRows: number, mineRows: number): string {
  if (!clean) {
    return `${label}の棚で**混ざっていました**（手羽屋の読みとよその店の読みのどちらかに、相手の行が入っています）`;
  }
  if (otherRows > 0) {
    return (
      `${label}：手羽屋として読むと ${mineRows}行、よその店として読むと ${otherRows}行。` +
      `**よその店の本物の行 ${otherRows}行 は、手羽屋の読みに1行も出てきません**` +
      "（絞っていなければ そのまま出てくる行です）"
    );
  }
  return `${label}：よその店の行がこの棚にまだ無いので、この棚は②の証拠になりません（0行）`;
}

function summaryOf(p: {
  measurable: boolean;
  clean: boolean | null;
  shelvesWithRealRows: number;
  otherShopRows: number;
  measured: number;
  unreadable: string[];
}): string {
  if (!p.measurable) {
    return "選択肢の棚を1つも読めませんでした（合格にも不合格にもしていません）";
  }
  const tail = p.unreadable.length
    ? `（読めなかった棚が ${p.unreadable.length} つあります：${p.unreadable.join("・")}）`
    : "";
  if (p.clean === false) {
    return `選択肢の棚 ${p.measured} つを数えたところ、**混ざっていました**${tail}`;
  }
  if (p.shelvesWithRealRows === 0) {
    return (
      `選択肢の棚 ${p.measured} つに混ざりはありませんが、よその店の行がまだ1行も無いので、` +
      `**『手羽屋として読むと よその店の行が出てこない』の証拠にはなりません**${tail}`
    );
  }
  return (
    `選択肢の棚 ${p.measured} つを数えました。よその店の**本物の行 ${p.otherShopRows}行**` +
    `（${p.shelvesWithRealRows} つの棚）は、手羽屋として読むと1行も出てきません。` +
    `＝ **逆向き（手羽屋として読むと よその店の行が出てこないか）を、本物の行で確かめました**${tail}`
  );
}
