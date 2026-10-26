/**
 * 「レシート写真の置き場を**閉める**（非公開にする）」1押しの決まり（f3-4・2026-10-26）。
 * **ここには通信を入れません**（判定と言葉だけを試験で固定するため。聞く所と閉める所は
 * app/api/keiri/photo-lock/route.ts）。
 *
 * ■ なぜこの1枚が要るのか（やさしい説明）
 *   レシート写真の置き場（receipts）は、いま**「公開」**の設定です。
 *   住所さえ知っていれば、合言葉なしで その1枚を開けます（一覧だけが閉まっています）。
 *   仕上げの ③（f3-4「よその店のデータが見えないか」）は、ここが開いているあいだ閉まりません。
 *
 *   閉める順番は決まっていて、**先に閉めると手羽屋のレシート写真が1枚も映らなくなります**：
 *     ① 画面が置き場の住所を直に使うのをやめ、こちら側の窓口ごしに見る … 2026-10-26 済み
 *     ② 窓口が**期限つきの住所**（60秒だけ有効）を出せるようにする ……… 2026-10-26 済み
 *     ③ 置き場を**非公開**にする ……………………………………………… ここ（この紙）
 *   ③に進めるのは、期限つきの住所を作れる**サーバー側の鍵**が使えるときだけです。
 *
 * ■ ここが無いと、じゅんの手が1回 増えます
 *   鍵を貼り直すのは じゅんの1分（/keiri/key）ですが、そのあと置き場を閉める手が
 *   **どこにも用意されていませんでした**。＝ 鍵が直っても f3-4 は閉まらず、
 *   次の回に もう一度 じゅんにお願いすることになります。
 *   この紙があると、**鍵を直したその場の1押しで終わります**。
 *
 * ■ 安全のために必ず守ること（route 側で実際にこの順で行います）
 *   ・閉める**前に**、期限つきの住所で写真が本当に読めることを1枚で確かめます
 *   ・閉めた**あとに**もう一度 読めることを確かめ、読めなければ**その場で元に戻します**
 *   ・置き場の制限（1枚5MB・画像だけ）は、読んだ値をそのまま書き戻します（緩めません）
 *   ・写真の中身・住所・鍵の値は1文字も返しません
 */

/** いまの状態（画面の色と見出しがこれで決まる） */
export type PhotoLockState = "nokey" | "ready" | "locked" | "unknown";

export type PhotoLockInput = {
  /** サーバー側の鍵が そのまま使えるか */
  keyUsable: boolean;
  /** 置き場が「公開」のままか（true=公開 / false=非公開 / null=確かめられない） */
  bucketPublic: boolean | null;
  /** 画面が窓口ごしに写真を見る形になっているか（コード側の決まり） */
  viewWindow: boolean;
};

export function photoLockState(input: PhotoLockInput): PhotoLockState {
  if (input.bucketPublic === false) return "locked";
  if (!input.keyUsable) return "nokey";
  if (input.bucketPublic === true && input.viewWindow) return "ready";
  return "unknown";
}

/** 画面のいちばん大きい1行 */
export function photoLockHeadline(state: PhotoLockState): string {
  switch (state) {
    case "locked":
      return "レシート写真の置き場は、もう非公開です。やることはありません";
    case "ready":
      return "レシート写真の置き場を閉められます（押すのは1回だけ）";
    case "nokey":
      return "レシート写真の置き場は公開のままです（上の4手で鍵を直すと、ここで閉められます）";
    case "unknown":
      return "レシート写真の置き場が公開かどうかを、いま確かめられませんでした";
  }
}

/** その下の1行（なぜ・何が起きるか） */
export function photoLockWhy(state: PhotoLockState): string {
  switch (state) {
    case "locked":
      return (
        "住所を知っていても、合言葉なしでは写真が開けません。" +
        "画面の写真は、こちら側の窓口が出す期限つきの住所（60秒）ごしに今までどおり映ります"
      );
    case "ready":
      return (
        "押すと、置き場を非公開に変えます。先に「期限つきの住所で写真が読めるか」を1枚で確かめ、" +
        "閉めたあとにもう一度 確かめます。読めなくなったら、その場で元に戻します（押し直す必要はありません）"
      );
    case "nokey":
      return (
        "置き場を閉めると、写真を見せるのに期限つきの住所が必要になります。" +
        "それを作れるのはサーバー側の鍵だけなので、鍵より先に閉めると写真が1枚も映らなくなります"
      );
    case "unknown":
      return "分からないので、何もしません（閉まったことにもしません）";
  }
}

/** じゅんの5手目（鍵が直ったその場で押せる1回） */
export const PHOTO_LOCK_STEP = {
  no: "⑤",
  where: "この1枚",
  what:
    "鍵が「そのまま使えます」に変わったら、下の［レシート写真の置き場を閉める］を1回 押します" +
    "（仕上げの ③ f3-4 がこれで閉まります）",
} as const;

/** 閉める操作のあと、何が起きたか（route が埋める） */
export type PhotoLockSteps = {
  keyUsable: boolean;
  /** 閉める前の設定（null=読めなかった） */
  bucketWasPublic: boolean | null;
  /** 確かめに使える写真が1枚 見つかったか */
  sampleFound: boolean;
  /** 閉める前に、期限つきの住所で読めたか（写真が無くて試していなければ null） */
  signedBefore: boolean | null;
  /** 閉める操作そのものが通ったか */
  closed: boolean;
  /** 閉めたあとの設定（null=読めなかった） */
  publicAfter: boolean | null;
  /** 閉めたあとに、期限つきの住所で読めたか（試していなければ null） */
  signedAfter: boolean | null;
  /** 読めなくなったので元に戻したか */
  rolledBack: boolean;
};

export type PhotoLockOutcome = {
  /** 置き場が「非公開」の状態で終わったか */
  ok: boolean;
  /** この回で設定を実際に変えたか */
  changed: boolean;
  said: string;
};

/** 何が起きたかを1行の日本語にする（試験で固定する所） */
export function describePhotoLock(s: PhotoLockSteps): PhotoLockOutcome {
  if (!s.keyUsable) {
    return {
      ok: false,
      changed: false,
      said:
        "サーバー側の鍵がまだ使えないので、何もしていません。" +
        "先に /keiri/key の4手（1分）で鍵を貼り直してください",
    };
  }
  if (s.bucketWasPublic === null) {
    return {
      ok: false,
      changed: false,
      said: "置き場の設定を読めなかったので、何もしていません（分からないものは触りません）",
    };
  }
  if (s.bucketWasPublic === false) {
    return { ok: true, changed: false, said: "置き場はもう非公開でした。何もしていません" };
  }
  if (s.sampleFound && s.signedBefore === false) {
    return {
      ok: false,
      changed: false,
      said:
        "閉める前の確かめで、期限つきの住所から写真を読めませんでした。" +
        "**閉めていません**（先に閉めると写真が映らなくなるため）",
    };
  }
  if (!s.closed) {
    return {
      ok: false,
      changed: false,
      said: "置き場を非公開にする操作が通りませんでした。設定は変わっていません",
    };
  }
  if (s.rolledBack) {
    return {
      ok: false,
      changed: false,
      said:
        "閉めたあとに写真が読めなくなったので、**その場で元に戻しました**（置き場は公開のままです）。" +
        "原因が分かるまで閉めません",
    };
  }
  if (s.publicAfter !== false) {
    return {
      ok: false,
      changed: true,
      said:
        "閉める操作は通りましたが、置き場が非公開になったことを確かめられませんでした。" +
        "もう一度 /api/keiri/photos を読んで確かめてください",
    };
  }
  const checked =
    s.signedAfter === true
      ? "閉めたあとも、期限つきの住所で写真が1枚 読めることを確かめました"
      : "置き場に写真が1枚も無いので、読めるかの確かめは行っていません（閉めても壊れるものがありません）";
  return {
    ok: true,
    changed: true,
    said: `置き場を**非公開**にしました。${checked}。これで住所を知っていても、合言葉なしでは開けません`,
  };
}

/** 外から読む人のための、1行の読み方 */
export const PHOTO_LOCK_HOW =
  "この窓口は『レシート写真の置き場を閉められるか・閉めたか』だけを返します。" +
  "読むだけ（GET）は1行も変えません。閉める（POST）は置き場の設定1つだけを変え、" +
  "**閉める前と後に写真が読めることを確かめ、読めなくなったらその場で元に戻します**。" +
  "写真の中身・住所・鍵や合言葉の値は1文字も返しません。" +
  "state は locked＝閉まっている／ready＝いま閉められる／nokey＝鍵待ち／unknown＝分かりません。";
