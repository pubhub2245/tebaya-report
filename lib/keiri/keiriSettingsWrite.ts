/**
 * 経理の設定（keiri_settings）に書き込んだあと、「本当に1行 変わったか」で
 * 合否を決める所（2026-10-20・kp253 ③・f3-3・f3-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   貼り紙⑫を流すと、経理の設定の棚は「印が空の行だけ 読んでよい」になります。
 *   手羽屋の行は印が空なので今までどおりですが、**申し込んだお店の行（印つき）は
 *   公開の鍵では読めなくなります**。
 *
 *   ここで困るのは「読む所」ではなく**「書く所」**です。
 *   倉庫に「書き換えてください」と頼んで、**書き換える相手が1行も見つからなかったとき、
 *   倉庫はエラーを返しません。「0行 変えました」と言って成功で返します。**
 *   いまの画面はエラーの有無だけを見ているので、
 *     ・経理の設定（数え始めの日・期首残高・家賃） → **何も変わっていないのに「✅ 保存しました」**
 *     ・金庫を数えた控え　　　　　　　　　　　　 → **何も残っていないのに「✅ 控えに残しました」**
 *   と出ます。お店は入れ終えたつもりで次に進み、**数え始めも金庫の記録も無いまま
 *   現金残高と利益が出ます**（何も壊れていないように見えるので気づけません）。
 *   日報の修正画面で同じ取り違えを直したのと同じ話です（lib/keiri/tenantReportWrite.ts）。
 *
 * ■ どう直すか
 *   書き込みのときに「変えた行」を返してもらい、**1行も変わっていなければ成功と言いません**。
 *   数えられなかったときも「保存しました」とは言わず、確かめられなかったと正直に出します。
 *
 * ■ 手羽屋は1行も変わりません（ここが大事）
 *   手羽屋（印が空）の行は締めたあとも読めるので、変えた行は必ず1行 返ります。
 *   ＝ 出る言葉も、押す回数も、通信の回数も今までどおりです。
 */

/** どちらの書き込みか（出す言葉がちがうため） */
export type SettingsWriteTarget =
  /** 経理の設定（数え始めの日・期首残高・率・家賃） */
  | "設定"
  /** 金庫を数えた1回の控え（置き場ができるまでの仮置き） */
  | "金庫の控え"
  /**
   * 「同じ支払いなので こちらは数えない」と決めた印の控え
   * （置き場ができるまでの仮置き・2026-10-22・kp230）
   */
  | "数えない印の控え";

export type SettingsWriteVerdict = {
  /** 画面で「できました」と言ってよいか */
  ok: boolean;
  /** そのまま画面に出す1行 */
  message: string;
  /** 人が倉庫側で確かめる必要があるか（お店に「もう一度 押して」とは言わないため） */
  needsHuman: boolean;
};

/** 手羽屋のときに今まで出していた言葉（1文字も変えない） */
const DONE: Record<SettingsWriteTarget, string> = {
  設定: "✅ 保存しました",
  金庫の控え: "✅ 控えに残しました（置き場ができたら、そのまま記録に移ります）",
  数えない印の控え:
    "✅ 決めた内容を残しました（記録は消していません。置き場ができたら、そのまま記録に移ります）",
};

/** 書き込みがエラーで返ったときに今まで出していた言葉（1文字も変えない） */
function failedBy(target: SettingsWriteTarget, reason: string): string {
  if (target === "設定") return `❌ 保存できませんでした：${reason}`;
  if (target === "数えない印の控え") return `保存できませんでした：${reason}`;
  return `控えを残せませんでした：${reason}`;
}

/** 画面に出すときの呼び名（言葉は今までのものを1文字も変えない） */
function whatOf(target: SettingsWriteTarget): string {
  if (target === "設定") return "設定";
  if (target === "数えない印の控え") return "決めた内容";
  return "金庫の控え";
}

/** 1行も変わらなかったときの言い方（「0行でした」とは言わず、やることを書く） */
function changedNothing(target: SettingsWriteTarget): string {
  const what = whatOf(target);
  return (
    `この画面からは、このお店の${what}を書き換えられませんでした（1行も変わっていません）。` +
    "入れていただいた中身は、まだどこにも残っていません。" +
    "お手数ですが、このままにして運営へお知らせください（こちらで倉庫側から入れ直します）。"
  );
}

/** 変えた行を数えられなかったときの言い方（「保存しました」とは言わない） */
function changedUnknown(target: SettingsWriteTarget): string {
  const what = whatOf(target);
  return (
    `${what}を書き換えたかどうかを、いま確かめられませんでした。` +
    "いちど画面を開き直して、入れた中身が残っているかを見てください" +
    "（残っていなければ、もう一度 入れてください）。"
  );
}

/**
 * 書き込みの結果から、画面に出す1行を決める。
 *
 * @param isTebaya      手羽屋として開いているか（印が空か）
 * @param errorMessage  倉庫が返したエラーの文（無ければ null）
 * @param changedRows   変えた行の数（返ってこなければ null＝数えられなかった）
 * @param target        どちらの書き込みか
 */
export function decideSettingsWriteResult(params: {
  isTebaya: boolean;
  errorMessage: string | null;
  changedRows: number | null;
  target: SettingsWriteTarget;
}): SettingsWriteVerdict {
  const { errorMessage, changedRows, target } = params;
  if (errorMessage) {
    return { ok: false, message: failedBy(target, errorMessage), needsHuman: false };
  }
  if (changedRows === null) {
    return { ok: false, message: changedUnknown(target), needsHuman: false };
  }
  if (changedRows <= 0) {
    return { ok: false, message: changedNothing(target), needsHuman: true };
  }
  return { ok: true, message: DONE[target], needsHuman: false };
}

/**
 * 金庫の控えは、先に「いま書いてあるひとこと」を読んでから足します。
 * その読みが**行を1つも返さなかったとき**に、そのまま書き込むと
 * 0行 変えて成功で返り、「✅ 控えに残しました」と嘘が出ます。
 *
 * ★手羽屋は行が必ずあるので、ここは今までどおり通ります。
 *
 * @param rowFound     ひとことを読んだときに行があったか
 * @param errorMessage その読みが返したエラー（無ければ null）
 */
export function decideMemoPreread(params: {
  isTebaya: boolean;
  rowFound: boolean;
  errorMessage: string | null;
  /** どちらの控えか（渡さなければ金庫の控え＝今までと同じ言葉） */
  target?: SettingsWriteTarget;
}): { proceed: boolean; message: string | null } {
  const { rowFound, errorMessage } = params;
  const target = params.target ?? "金庫の控え";
  if (errorMessage) {
    return { proceed: false, message: failedBy(target, errorMessage) };
  }
  if (!rowFound) {
    return {
      proceed: false,
      message:
        "このお店の経理の設定が、この画面からは読めませんでした。" +
        "控えを置く場所が分からないので、ここでは残しません（入れた中身はまだ残っていません）。" +
        "お手数ですが、このままにして運営へお知らせください。",
    };
  }
  return { proceed: true, message: null };
}
