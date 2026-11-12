/**
 * 「じゅんが金庫を数えて押したとき、その1回は本当に残せるのか」を
 * **押してもらう前に**確かめる所（2026-11-12・kp245・f1-4）。**計算だけ**。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   仕上げの f1-4（計算上の現金と、実際の金庫が合うか）に残っているのは
 *   じゅんの1分だけです。押すと、数えた1回は
 *   「経理の設定の おまけ欄」に控えられ、こちら側はその控えを読み返して合否を付けます。
 *
 *   ところが**控えが残せるかどうかは、一度も確かめていませんでした**。
 *   倉庫の決まり（鍵かけ）が書き込みを通さない形だと、倉庫はエラーを返さず
 *   「0行 変えました」と**成功で**返します。画面は正直に
 *   「1行も変わっていません」と出す作りになっていますが（lib/keiri/keiriSettingsWrite.ts）、
 *   それが分かるのは**じゅんが1分を使ったあと**です。
 *   ＝ 押してもらってから「残りませんでした」では、1分がまるごと無駄になります。
 *
 * ■ どう確かめるか（ここが大事）
 *   いま入っているおまけ欄を読み、**まったく同じ中身をそのまま書き戻します**。
 *   ・中身は1文字も変わりません（じゅんが9/10に書いた起点の一言も、そのままです）
 *   ・金額は1円も作らず、1円も直しません
 *   ・変えた行が1行 返れば「残せます」、0行なら「残せません」と分かります
 *   書き込みの許可があるかどうかは、中身が変わるかどうかと関係なく決まるので、
 *   これで本番と同じ答えが出ます。
 *
 * ■ ここでしないこと
 *   ① 金庫の金額を入れません（数えるのは じゅんです）
 *   ② おまけ欄の中身・金額・お店の名前・鍵の値を**1文字も返しません**
 *   ③ 合否（f1-4）の決め方は1文字も変えません。ここは「押す前の下見」です
 */

/** 下見の答え */
export type CashWriteProbe = {
  /** 控えを残せるか（true＝残せる／false＝残せない／null＝確かめられなかった） */
  canKeep: boolean | null;
  /** 手羽屋の行が見つかったか */
  rowFound: boolean;
  /** 書き戻しで変わった行の数（数えられなければ null） */
  changedRows: number | null;
  /** そのまま画面・窓口に出す1文 */
  verdict: string;
  /** じゅんに押してもらってよいか（false なら先にこちらで直す） */
  safeToPress: boolean;
};

/** 下見そのものができなかったとき（倉庫が眠っている・読めない） */
export function cashWriteProbeNotMeasurable(reason: string): CashWriteProbe {
  return {
    canKeep: null,
    rowFound: false,
    changedRows: null,
    verdict:
      `いまは下見ができませんでした（${reason}）。` +
      "**「残せない」という意味ではありません。** 時間をおいて、もう一度 開いてください。",
    safeToPress: false,
  };
}

/**
 * 書き戻しの結果から、下見の答えを決める。
 *
 * @param rowFound      手羽屋の行が1行 見つかったか
 * @param errorMessage  倉庫が返したエラーの文（無ければ null）
 * @param changedRows   変わった行の数（返ってこなければ null）
 */
export function decideCashWriteProbe(params: {
  rowFound: boolean;
  errorMessage: string | null;
  changedRows: number | null;
}): CashWriteProbe {
  const { rowFound, errorMessage, changedRows } = params;

  if (!rowFound) {
    return {
      canKeep: false,
      rowFound: false,
      changedRows: null,
      verdict:
        "経理の設定の行が1行も見つかりませんでした。" +
        "このままだと、金庫を数えて押しても控えは残りません（先にこちらで直します）。",
      safeToPress: false,
    };
  }

  if (errorMessage) {
    return {
      canKeep: false,
      rowFound: true,
      changedRows: null,
      // ★倉庫が返した文は、鍵や合言葉が混じることがあるので**そのまま出しません**
      verdict:
        "書き戻しが ことわられました。" +
        "このままだと、金庫を数えて押しても控えは残りません（先にこちらで直します）。",
      safeToPress: false,
    };
  }

  if (changedRows === null) {
    return {
      canKeep: null,
      rowFound: true,
      changedRows: null,
      verdict:
        "変わった行を数えられませんでした。残せるかどうかは、いま言い切れません。",
      safeToPress: false,
    };
  }

  if (changedRows <= 0) {
    return {
      canKeep: false,
      rowFound: true,
      changedRows: 0,
      verdict:
        "行は見つかりましたが、書き戻しで**1行も変わりませんでした**" +
        "（倉庫の決まりが書き込みを通していません）。" +
        "このままだと、金庫を数えて押しても控えは残りません（先にこちらで直します）。",
      safeToPress: false,
    };
  }

  return {
    canKeep: true,
    rowFound: true,
    changedRows,
    verdict:
      "**控えは残せます。**いま入っているのと同じ中身を書き戻して、" +
      `${changedRows}行 変わったことを確かめました（中身は1文字も変わっていません）。` +
      "＝ 金庫を1回 数えて押せば、その1回は記録に残り、f1-4 の合否が出ます。",
    safeToPress: true,
  };
}
