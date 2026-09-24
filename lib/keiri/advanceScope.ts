/**
 * 現場の立替（/keiri/advances）を、お店ごとに分けて使えるようにするための小さな道具。
 *
 * ■ 何のためのファイルか（やさしい説明）
 *   立替の棚（keiri_advance_expenses）には、長いあいだ
 *   「どの店のものか」の印（tenant_id）の欄がありませんでした。
 *   絞りようが無いので、2026-09-24 にひとまず
 *   **申し込んだお店にはこの画面を開かない**という門を掛けています。
 *   ＝ お金を払ったお店は、月15,000円に含まれるこの機能を**まったく使えません**。
 *
 *   欄は SQL で1つ足せます（supabase/migrations/keiri_advance_expenses_tenant_id.sql）。
 *   ただし「SQL を先に流してからアプリを出す」という順番の縛りを作ると、
 *   順番を間違えたときに **手羽屋が毎日使う画面がエラーで止まります**
 *   （日報のときは実際にその縛りがありました）。
 *
 * ■ そこでこのファイルがやること
 *   **欄があるかどうかを、アプリが自分で見て決めます。**
 *     ・欄がまだ無い … 今までどおり。手羽屋はそのまま使える／よそのお店には門
 *     ・欄がある     … ふつうに店ごとに絞る。よそのお店も自分のぶんだけ使える
 *   ＝ SQL を流す前でも後でも壊れません。**アプリを出し直す必要もありません。**
 *
 * ■ 手羽屋への影響：ありません
 *   手羽屋は印が空（null）のお店です。
 *   欄が無ければ今までどおり全部読み、欄があれば「印が空のものだけ」を読みます。
 *   いまある行はすべて印が空なので、**どちらでも見えるものは同じ**です。
 */

import { EXPENSE_ACCOUNTS } from "./accounts";

/**
 * 「その欄（列）がまだ無い」という断り方かどうかを見分ける。
 *
 * PostgreSQL は 42703（undefined_column）を返し、
 * PostgREST は「column ... does not exist」や
 * 「column ... of relation ... does not exist」と言ってきます。
 * どちらの言い方でも拾えるようにしてあります。
 *
 * ★「欄が無い」以外のエラー（通信できない・権限が無い等）で true を返さないこと。
 *   true にしてしまうと、本当は守れる場面で守りを外してしまいます。
 */
export function isMissingTenantColumn(
  error: { message?: string | null; code?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (String(error.code ?? "") === "42703") return true;
  // 「tenant_id」という言葉が入っている断りは、欄の話だと見てよい。
  // こちらが tenant_id で絞ったときにしか出ない断りなので、取り違える余地が無く、
  // 言い回しが将来変わっても（PostgREST の文言は版で変わる）拾い落とさない。
  return String(error.message ?? "").toLowerCase().includes("tenant_id");
}

/**
 * 立替の「種類」に出す選択肢。
 *
 * 手羽屋には倉庫に対応表（keiri_account_mapping）が12行入っているので、
 * これまでどおりそれを使います。
 * **申し込んだばかりのお店には、その12行がまだありません。**
 * そのとき選択肢が0個だと、画面はあるのに1件も登録できません。
 *
 * そこで、対応表が1行も無いお店には
 * **このアプリが元から持っている科目**（lib/keiri/accounts.ts の12個）のうち、
 * 「その場で自分のお金で払いうるもの」だけを出します。
 *
 * ★新しい科目は1つも作っていません。`fromExpenseText` が立っているもの
 *   （＝日報の自由入力からも自動で振り分けてよい、ふだんの買い物の科目）を
 *   そのまま並べているだけです。
 *   家賃・人件費（月まとめ）・外注費は、その場で立て替える種類のお金ではないので入りません
 *   （外注費は手羽屋の帳簿でだけ使う呼び名を含むため、よそのお店には出しません）。
 *
 * ★税区分（消費税の扱い）は**入れません**。
 *   税区分を決めるのは税務の判断で、このアプリはそれをしません（docs/keiri.md・CLAUDE.md 5-2）。
 *   決まっていないものは「まだ決まっていない」と正直に出します。
 */
export type AdvanceTypeOption = {
  source_type: string;
  label: string;
  account_title: string;
  sub_account: string | null;
  /** 税区分。分からないものは null（画面は「税理士さんと決めます」と出す） */
  tax_category: string | null;
  needs_tax_advisor_review: boolean;
};

/** 対応表がまだ無いお店に出す選択肢（科目は増やしていない） */
export const FALLBACK_ADVANCE_TYPES: AdvanceTypeOption[] = EXPENSE_ACCOUNTS.filter(
  (a) => a.fromExpenseText,
).map((a) => ({
  source_type: `advance_${a.key}`,
  label: a.label,
  account_title: a.label,
  sub_account: null,
  tax_category: null,
  needs_tax_advisor_review: true,
}));

/**
 * 「立替の棚に、どの店のものかの印の欄ができているか」を言葉に直すだけの部分。
 *
 * ■ なぜ要るのか（2026-09-24・kp127 の受け取り確認）
 *   欄を足す SQL（supabase/migrations/keiri_advance_expenses_tenant_id.sql）は、
 *   人が倉庫の画面で1回流します。ところが流したあと、
 *   **本当に流れたのかを確かめる方法が、SQL をもう一度書くことしかありませんでした。**
 *   流し忘れても画面は静かに「ご案内」を出すだけなので、
 *   お金を払ったお店がこの機能を使えないまま気づかれない、という形になります。
 *
 *   そこで診断（/api/keiri/diagnose）から1回開くだけで分かるようにします。
 *
 * ★ここは通信をしません。調べた結果を受け取って、言葉に直すだけです。
 * ★立替の中身（誰がいくら立て替えたか）は1行も返しません。欄の有無だけです。
 */
export type AdvanceTenantColumnReport = {
  /** 申し込んだお店が「立替経費」を使えるか */
  usable: boolean;
  /** 欄の有無を確かめられたか（false＝調べられなかった。分からないだけ） */
  known: boolean;
  note: string;
};

/** 欄を足す SQL の置き場所（言葉の中で1か所だけに書く） */
export const ADVANCE_TENANT_MIGRATION =
  "supabase/migrations/keiri_advance_expenses_tenant_id.sql";

export function describeAdvanceTenantColumn(probe: {
  /** 印の欄を指定して1行読んでみて、断られなかったか */
  ok: boolean;
  error?: { message?: string | null; code?: string | null } | null;
}): AdvanceTenantColumnReport {
  if (probe.ok) {
    return {
      usable: true,
      known: true,
      note: "使えます。申し込んだお店も /keiri/advances で自分のぶんだけ立替を記録できます（手羽屋は印が空のままなので、見えるものは今までどおりです）",
    };
  }
  if (isMissingTenantColumn(probe.error)) {
    return {
      usable: false,
      known: true,
      note: `まだ使えません。倉庫の SQL Editor で ${ADVANCE_TENANT_MIGRATION} を1回流すと、その瞬間から使えるようになります（アプリを出し直す必要はありません。既存の行は1行も書き換わりません）`,
    };
  }
  return {
    usable: false,
    known: false,
    note: "確かめられませんでした（欄が無いのか、読みに行けなかったのかが分かりません）。申し込んだお店には、これまでどおりご案内を出します",
  };
}
