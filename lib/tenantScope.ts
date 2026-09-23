/**
 * 「この日報は、どのお店のものか」の印（テナント）を扱う、ただ1か所のファイル。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   このアプリは元々「手羽屋1店舗だけ」を前提に作られていました。
 *   経理パッケージを他のお店に売ると、そのお店が打った日報が
 *   手羽屋の日報と同じ棚に入ってしまい、
 *   ・払ったお店の経理画面に**手羽屋の売上**が出る
 *   ・手羽屋の画面にも**よそのお店の日報**が混ざる
 *   という事故になります（docs/auto/2026-09-18_経理パッケージ_2店舗目は使えるか_実測.md）。
 *
 * ■ どう直すか
 *   日報に「どの店か」の印（daily_reports.tenant_id）を1つ足し、
 *   画面はその印のぶんだけを読むようにします。
 *
 * ■ 手羽屋の今の行は1つも書き換えません（ここがいちばん大事）
 *   手羽屋は **印が空（null）** のお店として扱います。
 *   いまある日報はすべて印が空なので、
 *   「印が空のものだけ」で絞った結果は **いまと1行も変わりません**。
 *   これから手羽屋が打つ日報も印は空のままです。
 *   つまり手羽屋にとっては、見えるものも保存されるものも今までどおりです。
 *
 * ■ 使い方（画面側）
 *     applyTenantScope(supabase.from("daily_reports").select("..."), scope)
 *   scope が null（手羽屋）なら「印が空のものだけ」、
 *   お店の番号なら「その番号のものだけ」に絞ります。
 */

/**
 * どのお店の画面として動いているか。
 * null ＝ 手羽屋（印が空）。文字列 ＝ 経理パッケージを申し込んだお店の番号。
 */
export type TenantScope = string | null;

/** 手羽屋。印を持たないお店 */
export const TEBAYA_SCOPE: TenantScope = null;

/** 日報などに足した「どの店か」の印の列名 */
export const TENANT_COLUMN = "tenant_id";

/** ブラウザに控えておく置き場所の名前（どのお店として開いているか） */
export const TENANT_STORAGE_KEY = "keiri-tenant-id";

/** 手羽屋が使う業態コード（今までどおり） */
export const TEBAYA_BUSINESS_CODE = "tebaya";

/**
 * お店の番号のかたち（UUID）だけを受け付ける。
 * 変な文字が入った値でうっかり別のお店の棚を触らないようにするため。
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 受け取った値を印として使ってよいか確かめる。だめなら手羽屋（null）に倒す */
export function normalizeTenantScope(raw: unknown): TenantScope {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return TEBAYA_SCOPE;
  return UUID_RE.test(s) ? s : TEBAYA_SCOPE;
}

/**
 * 設定の棚（keiri_settings / keiri_payments）で使う業態コード。
 * 手羽屋は今までどおり 'tebaya'。よそのお店は 't_<お店の番号>'。
 * ★ lib/keiri/tenants.ts の tenantBusinessCode と必ず同じ形にすること。
 */
export function businessCodeForScope(scope: TenantScope): string {
  const id = normalizeTenantScope(scope);
  return id ? `t_${id}` : TEBAYA_BUSINESS_CODE;
}

/** 日報を保存するときに足す印。手羽屋は null（＝今までと同じ中身） */
export function tenantStamp(scope: TenantScope): { tenant_id: string | null } {
  return { tenant_id: normalizeTenantScope(scope) };
}

/**
 * 絞り込みを1つ足せる物（Supabase の問い合わせ）の最小の形。
 * 本物の型に縛られないようにしてあるので、テストで偽物を渡して確かめられる。
 */
export type ScopableQuery<T> = {
  is(column: string, value: null): T;
  eq(column: string, value: string): T;
};

/**
 * 問い合わせに「このお店のぶんだけ」の絞り込みを足す。
 *
 * ★手羽屋（null）のときは `tenant_id が空のものだけ` になる。
 *   いまある日報はすべて空なので、**結果はいまと1行も変わらない**。
 */
export function applyTenantScope<T>(query: ScopableQuery<T>, scope: TenantScope): T {
  const id = normalizeTenantScope(scope);
  return id ? query.eq(TENANT_COLUMN, id) : query.is(TENANT_COLUMN, null);
}

/**
 * 同じ絞り込みを、すでに手元にある行の並びに対して行う（計算とテスト用）。
 * 画面を通さずに「絞る前と後で手羽屋の行が変わらないか」を確かめられるようにしてある。
 */
export function rowsInScope<R extends { tenant_id?: string | null }>(
  rows: R[],
  scope: TenantScope,
): R[] {
  const id = normalizeTenantScope(scope);
  return rows.filter((r) => {
    const v = r.tenant_id ?? null;
    return id ? v === id : v === null;
  });
}

/**
 * ブラウザの控えから「いまどのお店として開いているか」を読む。
 * 読めない・入っていない・形が違うときは手羽屋（null）。
 * ★控えが読めない環境（プライベートウィンドウ等）でも落ちないように包んである。
 */
export function readTenantScope(store?: Pick<Storage, "getItem">): TenantScope {
  try {
    const s = store ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!s) return TEBAYA_SCOPE;
    return normalizeTenantScope(s.getItem(TENANT_STORAGE_KEY));
  } catch {
    return TEBAYA_SCOPE;
  }
}

/** ブラウザの控えに「このお店として開く」を書く。null を渡すと手羽屋に戻す */
export function writeTenantScope(
  scope: TenantScope,
  store?: Pick<Storage, "setItem" | "removeItem">,
): void {
  try {
    const s = store ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!s) return;
    const id = normalizeTenantScope(scope);
    if (id) s.setItem(TENANT_STORAGE_KEY, id);
    else s.removeItem(TENANT_STORAGE_KEY);
  } catch {
    /* 控えが使えない環境でも落とさない */
  }
}

/* ------------------------------------------------------------------ *
 *  まだ「どの店か」の印を持っていない棚（2026-09-24 追加）
 * ------------------------------------------------------------------ */

/**
 * 「どの店か」の印（tenant_id）の欄が、まだ**棚そのものに無い**もの。
 *
 * ■ どういうことか（やさしい説明）
 *   日報・出店場所・担当者・商品・経理の設定には、2026-09 の工事で
 *   「どの店のものか」の印を1つずつ足しました。
 *   ところが **出店予定（shifts）**・**現場の立替（keiri_advance_expenses）**、
 *   そして **意見箱（feedback_box / feedback_replies）** と
 *   **ミーティング議題（agenda_items）** には、まだその欄がありません。
 *   欄が無いので絞りようが無く、そのままだと
 *   ・経理パッケージを申し込んだお店のスタッフに、**手羽屋の出店予定と立替が見える**
 *   ・逆に、申し込んだお店が入れた予定・立替が、**手羽屋の画面に混ざる**
 *   の両方が起きます。
 *   意見箱とミーティング議題は金額こそ出ませんが、
 *   **手羽屋のスタッフが実名で書いた困りごと・相談がそのまま読め**、
 *   ミーティング議題にいたっては画面から**削除**までできてしまいます。
 *
 * ■ どう守っているか
 *   欄ができるまでのあいだ、**その画面を、申し込んだお店には開かない**ようにします
 *   （`isTebayaScope` が false のときは中身を出さず、準備中とだけ伝える）。
 *   見せない・書かせない、の2つを同時に止められるので、
 *   棚に手を入れずに、混ざる道を両方ふさげます。
 *
 * ■ 手羽屋は1つも変わりません
 *   手羽屋は印が空（null）なので `isTebayaScope` は必ず true。
 *   これまでどおり、同じ画面がそのまま出ます。
 *
 * ★ 棚に欄を足したら（Supabase で1列足すだけ）、ここから名前を外し、
 *   ふつうに `applyTenantScope` で絞る形に直してください。
 */
export const TABLES_WITHOUT_TENANT_COLUMN = [
  "shifts",
  "keiri_advance_expenses",
  // 2026-09-24 追加。金額は出ないが、手羽屋のスタッフの書き込み（名前つき）が見える。
  // 意見箱は消せないが、ミーティング議題は画面から**削除**までできてしまう。
  "feedback_box",
  "feedback_replies",
  "agenda_items",
] as const;

/** いま手羽屋として開いているか（印が空＝手羽屋） */
export function isTebayaScope(scope: TenantScope): boolean {
  return normalizeTenantScope(scope) === null;
}
