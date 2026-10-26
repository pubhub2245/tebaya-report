/**
 * 「レシート写真の置き場が、お店ごとに分かれているか」を数える決まり（f3-4・2026-10-26）。
 * **ここには通信を入れません**（judge だけを試験で固定するため。聞く所は lib/keiri/photoProbe.ts）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   お店ごとに分ける工事は、ずっと**棚（テーブル）**だけを見てきました。
 *   棚の仕分け表（lib/tenantTables.ts）も、はじめに「ここは棚の話だけ」と書いてあります。
 *   ところが経理の記録には、棚ではない置き場が1つあります。**レシート写真**です
 *   （CLAUDE.md 4-7。写真は `receipts` という置き場に置き、記録には住所だけを持たせる）。
 *   レシート写真は、その店の経理そのものです。**ここが分かれていなければ f3-4 は閉まりません。**
 *
 * ■ 見るのは「一覧が読めるか」1つだけ
 *   置き場は**公開**です（住所を知っている人は、その1枚を見られます）。
 *   住所にはでたらめな名前（UUID）が入るので、住所を知らない人には届きません。
 *   危ないのは **置き場の中身を一覧で読めてしまうこと**です。読めると、
 *   よその店の写真も手羽屋の写真も、まとめて拾えます。
 *   CLAUDE.md 4-7 は「置く許可（INSERT）だけを与えており、一覧取得はできない」と書いていますが、
 *   **外から確かめたことは一度もありません**。ここで確かめます。
 *
 * ■ 「0件」を「閉まっている」と言わないための決まり（いちばん大事）
 *   倉庫は、鍵が効いているとき**エラーではなく「0件」**で返します（→ lib/keiri/shelvesProbe.ts ⑦と同じ）。
 *   置き場が**空っぽ**のときも「0件」です。**この2つは外から見分けられません。**
 *   そこで「写真が1枚でもあること」を別に数え（knownPhotos）、
 *     ・写真があるのに 0件 … 鍵が効いている（＝閉まっている）
 *     ・写真があるか分からないのに 0件 … **分かりません**（閉まったことにしない）
 *   と分けます。1件でも返れば、その場で「まだ開いている」です。
 */

/** 一覧を聞いた結果。items は返ってきた数（聞けなかったときは null） */
export type ShelfListOutcome = {
  /** 聞いた場所（置き場の中のフォルダ名。"" は いちばん上） */
  folder: string;
  /** 返ってきた数（0 もありえる）。聞けなかったときは null */
  items: number | null;
  /** 断られた・通信できなかったときの理由（鍵・住所は入れない） */
  error: string | null;
  /** はっきり「許可がありません」と断られたか */
  denied: boolean;
};

export type PhotoShelfVerdict = {
  /**
   * 置き場の一覧が、公開の鍵で読めてしまうか。
   * true ＝ まだ開いている（直すこと） / false ＝ 閉まっている / null ＝ 分かりません
   */
  listable: boolean | null;
  /** お店ごとのフォルダに分けて置く形になっているか（コード側の決まり） */
  separatedByFolder: boolean;
  /** 1行の説明 */
  note: string;
};

/** 写真を置くときのフォルダの頭（どの画面から入れた写真か） */
export const PHOTO_PREFIXES = ["report", "advance", "keiri"] as const;

/** お店ごとのフォルダの頭（→ lib/receiptImage.ts の photoFolderForTenant） */
export const PHOTO_TENANT_PREFIX = "t";

export function judgePhotoShelf(input: {
  /** 一覧を聞いた結果（いちばん上＋フォルダごと） */
  outcomes: ShelfListOutcome[];
  /** 置き場に写真が1枚でもあると分かっているか（分からなければ null） */
  knownPhotos: number | null;
  /** コード側が お店ごとのフォルダに分けて置く形になっているか */
  separatedByFolder: boolean;
}): PhotoShelfVerdict {
  const { outcomes, knownPhotos, separatedByFolder } = input;
  const seen = outcomes.filter((o) => o.items !== null);
  const opened = seen.filter((o) => (o.items ?? 0) > 0);

  if (opened.length > 0) {
    return {
      listable: true,
      separatedByFolder,
      note:
        "**公開の鍵で、置き場の中身が一覧で読めます（まだ開いています）。**" +
        `読めた場所は ${opened.length} か所。置き場の鍵の決まり（一覧を禁じる）を1回 入れてください`,
    };
  }

  if (outcomes.some((o) => o.denied)) {
    return {
      listable: false,
      separatedByFolder,
      note: "公開の鍵では、置き場の一覧が**はっきり断られました**（閉まっています）",
    };
  }

  if (seen.length === 0) {
    return {
      listable: null,
      separatedByFolder,
      note:
        "置き場に聞けませんでした（通信できない・置き場が無い等）。" +
        "分からないので、閉まったことにはしません" +
        (outcomes.find((o) => o.error)?.error ? `。理由：${outcomes.find((o) => o.error)?.error}` : ""),
    };
  }

  if ((knownPhotos ?? 0) > 0) {
    return {
      listable: false,
      separatedByFolder,
      note:
        `置き場には写真が ${knownPhotos} 枚以上あるのに、公開の鍵では **1件も返りません**。` +
        "＝ 一覧の鍵が効いています（閉まっています）",
    };
  }

  return {
    listable: null,
    separatedByFolder,
    note:
      "公開の鍵では1件も返りませんでしたが、**置き場が空なのか鍵が効いているのかを外から見分けられません**。" +
      "写真が1枚でもあると数えられた回に、はじめて『閉まっている』と言えます",
  };
}

/** 外から読む人のための、1行の読み方 */
export const PHOTO_SHELF_HOW =
  "**listable が false（または null でない false）になって初めて、写真の置き場は f3-4 の合格材料になります。**" +
  "読み方はここだけ逆で、**読めてしまったら まだ開いている**です（→ /api/keiri/copies の⑦と同じ）。" +
  "separatedByFolder は『これから置く写真が、お店ごとのフォルダに入る形になっているか』で、" +
  "手羽屋の写真の住所は今までと1文字も変わりません。" +
  "★この窓口は1枚も写真を読まず、写真の住所・金額・お店の名前を1文字も返しません";
