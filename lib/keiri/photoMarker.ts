/**
 * 「レシート写真の置き場の一覧は、本当に閉まっているのか」を
 * **鍵が無くても外から確かめられる**ようにするところ（f3-4・2026-10-27）。
 *
 * ■ 何が分からなかったのか（やさしい説明）
 *   倉庫は、一覧を読む許可が無いとき**エラーではなく「0件」**で返します。
 *   置き場が**空っぽ**のときも「0件」です。この2つは外から見分けられません。
 *   そのため /api/keiri/photos の答えは、ずっと `listable: null`（＝分かりません）でした。
 *   置き場には写真が2枚 入っているのですが、**その住所がどの記録にも入っていない**ので
 *   「1枚でもある」を記録の側から数えることもできませんでした。
 *   住所そのものを司令室に書けば数えられますが、置き場が公開のあいだは
 *   **住所がそのまま鍵になってしまう**ので、それはしません。
 *
 * ■ どう解いたか
 *   **こちらで1枚だけ、中身の無い「目印の画像」を置きます**（1×1の透明な PNG・68バイト）。
 *   住所は決め打ちで、司令室にも書けます（開いても透明な点1つしか出ません）。
 *   ・目印があるのに一覧が「0件」 … 一覧は**閉まっている**（listable = false）
 *   ・目印が一覧に出てくる … 一覧は**開いている**（listable = true・直すこと）
 *   ＝ 鍵（サーバー側の合言葉）も、じゅんの手も要りません。
 *
 * ■ 本物のデータには1件も混ざりません
 *   置くのは `probe/` という**目印だけのフォルダ**で、レシートの置き場所
 *   （`report/` `advance/` `keiri/` `t/`）とは別です。
 *   日報・経費・申し込みの**行には1件も触りません**（住所をどこにも書きません）。
 *   手羽屋の写真2枚は**消しません・動かしません**。
 *
 * ★この紙には通信を入れません（判定だけを試験で固定するため）。
 *   置く・聞くのは lib/keiri/photoMarkerProbe.ts です。
 */

/** 目印だけを置くフォルダ（レシートの置き場所とは分けます） */
export const PHOTO_MARKER_FOLDER = "probe";

/** 目印の名前（決め打ち。開いても透明な点1つしか出ません） */
export const PHOTO_MARKER_NAME = "listcheck.png";

/** 目印の住所（置き場の中） */
export const PHOTO_MARKER_PATH = `${PHOTO_MARKER_FOLDER}/${PHOTO_MARKER_NAME}`;

/**
 * 1×1 の透明な PNG（68バイト）。
 * **中身に意味はありません。**「置き場が空っぽではない」と言うためだけに置きます。
 */
export const PHOTO_MARKER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

/** 目印の中身（バイト）を作る */
export function photoMarkerBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(PHOTO_MARKER_PNG_BASE64, "base64"));
}

/** 目印を置こうとした結果 */
export type MarkerPlacement =
  /** いま1枚 置いた（これから先はずっとある） */
  | "placed"
  /** すでに置いてあった（何も書き込んでいません） */
  | "already"
  /** 置かせてもらえなかった（置き場の決まりが「置くのも禁止」） */
  | "denied"
  /** 聞けなかった（通信できない等） */
  | "unknown";

/** 目印があると言い切れるか */
export function markerIsThere(placement: MarkerPlacement): boolean {
  return placement === "placed" || placement === "already";
}

/**
 * 倉庫が返した断りの文から、「すでにある」かどうかを読む。
 * ★文そのものは返しません（鍵・住所は入りませんが、念のため外に出しません）。
 */
export function readsAsAlreadyThere(message: string, status?: number | null): boolean {
  if (status === 409) return true;
  return /already exists|duplicate|resource already/i.test(message);
}

/** 置かせてもらえなかった断りか */
export function readsAsDenied(message: string, status?: number | null): boolean {
  if (status === 401 || status === 403) return true;
  return /not authorized|unauthorized|permission|violates row-level|new row violates/i.test(message);
}

export type MarkerListVerdict = {
  /** 一覧が公開の鍵で読めてしまうか。true ＝ 開いている / false ＝ 閉まっている / null ＝ 分かりません */
  listable: boolean | null;
  /** 目印が置き場にあると言い切れるか */
  marker: MarkerPlacement;
  /** 目印のフォルダを一覧で聞いたときに返ってきた数（聞けなければ null） */
  listed: number | null;
  /** 1行の説明 */
  note: string;
};

/**
 * 「目印はあるか」と「一覧は何件 返ったか」から、一覧が閉まっているかを決める。
 * **ここが唯一の決まりです**（窓口が2つあっても答えが割れないように・CLAUDE.md 4-1）。
 */
export function judgeMarkerList(input: {
  marker: MarkerPlacement;
  listed: number | null;
}): MarkerListVerdict {
  const { marker, listed } = input;

  if (listed !== null && listed > 0) {
    return {
      listable: true,
      marker,
      listed,
      note:
        "**公開の鍵で、置き場の中身が一覧で読めます（まだ開いています）。**" +
        "よその店の写真も手羽屋の写真も、まとめて拾えてしまう状態です。" +
        "置き場の鍵の決まり（一覧を禁じる）を1回 入れてください",
    };
  }

  if (marker === "denied") {
    return {
      listable: null,
      marker,
      listed,
      note:
        "目印の画像を置かせてもらえませんでした（置き場の決まりが『置くのも禁止』です）。" +
        "置き場が空っぽなのか一覧が閉まっているのかは、**分かりません**のままにします",
    };
  }

  if (marker === "unknown" || listed === null) {
    return {
      listable: null,
      marker,
      listed,
      note:
        "置き場に聞けませんでした（通信できない等）。分からないので、閉まったことにはしません",
    };
  }

  return {
    listable: false,
    marker,
    listed,
    note:
      "置き場には目印の画像が**1枚 確かにある**のに、公開の鍵では **1件も返りません**。" +
      "＝ 一覧の鍵が効いています（**閉まっています**）。" +
      (marker === "placed"
        ? "目印はこの回に1枚 置きました（本物のレシートではありません）"
        : "目印は前の回に置いたものです（この回は1行も書き込んでいません）"),
  };
}

/** 外から読む人のための、1行の読み方 */
export const PHOTO_MARKER_HOW =
  "**置き場の一覧が閉まっているかを、鍵なしで確かめる窓口です。**" +
  "倉庫は許可が無いとき『0件』で返すので、空っぽと閉まっているを見分けられません。" +
  `そこで置き場に **中身の無い目印の画像1枚**（1×1の透明な点・${PHOTO_MARKER_PATH}）だけを置き、` +
  "それが一覧に出てこないことで『閉まっている』と言います。" +
  "★置くのはこの1枚だけで、**本物のレシート・日報・経費・申し込みの行には1件も触りません**。" +
  "★手羽屋の写真は消しません・動かしません。" +
  "★この窓口は、置き場が公開でも非公開でも同じように使えます" +
  "（/api/keiri/photos のほうは読むだけなので、置き場が公開のあいだだけ目印を見つけられます）";
