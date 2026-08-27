/**
 * 出店先 売上分析 用の名寄せ（なよせ）。
 *
 * ■ 変更履歴（2026-08）
 *   以前はこのファイルの中に独自の名寄せ表を持っていたが、
 *   同じ表がアプリ内に4か所あり、場所ごとに正式名がバラバラだった。
 *   （ここは「ながやま三股店」、マスタは「ながやま三股」…）
 *   名寄せのルールは lib/locationName.ts の1か所に集約した。
 *   このファイルは、これまでの呼び出し名をそのまま使えるようにするための橋渡し。
 *
 *   ★ 名寄せのルールを直すときは lib/locationName.ts を直すこと。
 */

export {
  canonicalLocationName as normalizeOutletName,
  isEventLocation as isEventOutlet,
} from "../locationName";
