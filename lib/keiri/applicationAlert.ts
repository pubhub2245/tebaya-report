/**
 * 「お申し込みが入っています」の赤い知らせ（kp156）の、計算だけのファイル。
 *
 * ■ なぜ作ったか（やさしい説明）
 *   お申し込みが1件入ったとき、いま人が気づける道は2本しかありません。
 *     ① スタッフの LINE グループへの知らせ
 *     ② 申し込んだ方が、画面に出る「控えのメール」を自分で押してくれること
 *   ところが①は **今月あと 5 通** しか残っていません（9/25 に本番で実測）。
 *   毎日の日報の知らせでも同じ通数を使うので、月末を待たずに無くなります。
 *   そうなると、お申し込みの行は倉庫に残るのに（＝お金の取りこぼしではない）、
 *   **誰も気づかないまま何日も置かれる**ことになります。
 *   最初の1件でそれが起きるのがいちばん高くつくので、
 *   じゅんが毎日開く画面のいちばん上に、赤い知らせを出します。
 *
 * ■ 鍵（kp55）が壊れていても数えられます
 *   倉庫に置いた「数だけ答える窓口」（keiri_applications_summary）を使います。
 *   じゅんの手はいりません。SQL を流し直す必要もありません。
 *
 * ■ 出さないもの（大事）
 *   お店の名前・お名前・メール・電話は**1文字も出しません**。出すのは件数と時刻だけです。
 *   知らせが出るのは じゅんの端末だけ（帯と同じ印を使います）。スタッフには出ません。
 */

/** 窓口から受け取る「数」だけの返事 */
export type ApplicationCountSummary = {
  countable: boolean;
  pending: number | null;
  total: number | null;
  latestAt: string | null;
};

/**
 * 赤い知らせを出すか。
 * 出すのは「じゅんの端末」「数えられた」「まだ手当てしていない申し込みが1件以上ある」の3つが揃うときだけ。
 * ★数えられなかったとき（countable:false）は**出しません**。
 *   「0件」と「数えられない」を取り違えて嘘の安心・嘘の警報を出さないため。
 */
export function shouldShowApplicationAlert(input: {
  ownerDevice: boolean;
  summary: ApplicationCountSummary | null;
}): boolean {
  if (!input.ownerDevice) return false;
  const s = input.summary;
  if (!s || !s.countable) return false;
  return typeof s.pending === "number" && s.pending > 0;
}

/** 知らせの見出し（件数だけ。連絡先は入れない） */
export function applicationAlertHeadline(pending: number): string {
  return `お申し込みが ${pending} 件、まだ手当てされていません`;
}

/**
 * 「いつ入ったか」を、日本時間の読みやすい形にする。
 * 読めない・無いときは null（その行を出さない）。
 */
export function applicationAlertWhen(latestAt: string | null): string | null {
  if (!latestAt) return null;
  const d = new Date(latestAt);
  if (Number.isNaN(d.getTime())) return null;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日 ${p(
    jst.getUTCHours(),
  )}:${p(jst.getUTCMinutes())}`;
}

/** 窓口の返事を、画面が使える形に直す（読めない中身は countable:false にする） */
export function readApplicationCountSummary(raw: unknown): ApplicationCountSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const countable = o.countable === true;
  return {
    countable,
    pending: num(o.pending),
    total: num(o.total),
    latestAt: typeof o.latestAt === "string" && o.latestAt ? o.latestAt : null,
  };
}
