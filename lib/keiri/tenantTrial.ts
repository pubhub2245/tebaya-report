/**
 * 「2軒目のお店を入れる手順」を、こちら（Claude）だけで1回 通すための1か所（f5-4・f3-4）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   2軒目を入れる手順は6手あって（/keiri/tenant-new）、そのうち **手順1「お店の行を1つ作る」だけ**が
 *   倉庫（Supabase）の画面を開ける人＝じゅんにしかできませんでした。
 *   お店の棚（keiri_tenants）はブラウザから読めも書けもしない決まりで、
 *   作る命令（keiri_tenant_create_manual）も「流す人の権限で動く」形だからです。
 *   そのため **テスト用の店を1軒も作れず、手順を端から端まで通した記録が0件**のままでした。
 *
 * ■ どう直すか
 *   手順1を、**仕組み側の鍵（service_role）を持っているサーバーの中**でやります。
 *   ただし「好きな名前のお店をいくらでも作れる窓口」は作りません（2026-09-19 に一度 開いて閉じた経緯があります）。
 *   作れるのは **下に書いた1軒（テストの店）だけ**で、何度 呼んでも増えません。
 *
 * ■ ここで作る1軒は、手羽屋のデータに1行も混ざりません
 *   ・お店の棚に1行（名前の頭に【テスト】が付きます）
 *   ・そのお店ぶんの経理の設定に1行（業態コードは t_<お店の番号>。手羽屋の 'tebaya' とは別）
 *   日報・経費・申し込みの行は**1行も作りません**。
 *   手羽屋の画面（日報・シフト・レジ・LINE）は、印が空のものだけを見ているので何も変わりません。
 *
 * ■ まだできないこと（正直に）
 *   手順4・5（出店場所・商品・スタッフを入れる）は、ここではやりません。
 *   出店場所と担当者の棚は、手羽屋が毎日使う画面（日報の場所の選び方・シフト）が
 *   **お店で絞らずに読んでいる**ので、テストの店のぶんを入れると
 *   手羽屋の選択肢に「テスト広場」「テスト太郎」が出てしまいます。
 *   先にそちらを絞ってからでないと入れられません。
 */

/** テストの店の入れ値。B2 の材料（meta/keiri-material-test-mise-1006）と同じ値です */
export const TEST_SHOP = {
  /** ひと目でテストと分かる名前（本物の軒数に数えないこと） */
  name: "【テスト】B2検査食堂",
  /** 何度 呼んでも1軒しか作らないための目印。お店の棚で一意になる欄に入れます */
  mark: "test-b2-kensa-1006",
  /** 数え始めの日 */
  openingDate: "2026-10-06",
  /** その日の手元の現金（金庫の起点・円） */
  openingBalance: 30000,
} as const;

/** この手順に許す時間（f5-4 の「30分以内」） */
export const TRIAL_LIMIT_MS = 30 * 60 * 1000;

/** かかった時間を人の言葉にする（例「3.4秒」「1分12秒」） */
export function elapsedLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "分かりません";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}秒`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}分${s}秒`;
}

/** 読んだ結果（件数だけ）。金額は1円も通しません */
export type TrialRead = {
  reportCount: number;
  advancesRead: boolean;
  readable: boolean;
};

/**
 * 「分かれている」と言ってよいか。
 *
 * ★テストの店として読んで0件 だけでは足りません（棚が落ちていても0件になるため）。
 *   手羽屋として読んだときに**ちゃんと行が出ている**ことまで揃って、初めて
 *   「分かれている」と言えます。
 * ★立替の2つの棚には「どの店のものか」の欄がまだ無いので、
 *   テストの店には**読まない**のが正しい形です。
 */
export function separationOk(params: { tebaya: TrialRead; testShop: TrialRead }): boolean {
  const { tebaya, testShop } = params;
  return (
    tebaya.readable &&
    tebaya.reportCount > 0 &&
    testShop.reportCount === 0 &&
    testShop.advancesRead === false
  );
}

/** 手順がどこまで通ったか */
export type TrialState = {
  /** お店の行があるか */
  exists: boolean;
  /** この呼び出しで新しく作ったか */
  createdNow: boolean;
  /** 初回設定（店名・数え始めの日・金庫の起点）まで終わったか */
  active: boolean;
  /** そのお店ぶんの経理の設定の行ができたか */
  settingsReady: boolean;
};

/** 1行のまとめ（窓口の summary） */
export function trialSummary(params: {
  state: TrialState;
  separated: boolean;
  elapsedMs: number | null;
}): string {
  const { state, separated, elapsedMs } = params;
  if (!state.exists) {
    return "テストの店はまだありません。この住所に POST を1回 送ると、こちら側だけで1軒 作れます";
  }
  const time =
    elapsedMs === null
      ? ""
      : `所要 ${elapsedLabel(elapsedMs)}（30分以内：${elapsedMs <= TRIAL_LIMIT_MS ? "はい" : "いいえ"}）。`;
  const setup = state.active
    ? "初回設定（店名・数え始めの日・金庫の起点）まで終わっています"
    : "お店の行はできていますが、初回設定がまだです";
  const scope = separated
    ? "このお店として読むと手羽屋の日報は1件も出ず、立替の棚も読みません（混ざりません）"
    : "分かれているかを確かめられませんでした";
  return `テストの店（${TEST_SHOP.name}）：${setup}。${time}${scope}`;
}
