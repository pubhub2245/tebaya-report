/**
 * 経理パッケージ：申し込んだお店の「初回設定」と「合言葉の確認」を
 * **サーバー側の合鍵が壊れていても** 通す道（kp93）。
 *
 * ■ なぜ要るのか
 *   お店の置き場（keiri_tenants）には鍵が掛かっていて、
 *   サーバー側の合鍵（SUPABASE_SERVICE_ROLE_KEY）でしか読み書きできません。
 *   その合鍵が壊れている間（kp55）は、
 *     ・初回設定のリンクを開く → 「このリンクは使えません」
 *     ・合言葉で経理画面に入る → 「パスワードが違います」
 *   になります。＝ **お金を払ったお店が1歩も進めません。**
 *
 * ■ どう直すか
 *   棚は鍵を掛けたまま、「この2つの用事だけを代わりにやる小さな窓口」を
 *   倉庫の側に置きました（supabase/migrations/keiri_tenant_rpc.sql）。
 *   訪問の数を数える窓口（site_visits_summary）と同じ作りです。
 *   窓口は用事の結果しか返さないので、棚の中身は1行も見えません。
 *
 * ■ 順番
 *   窓口があればそれを使い、無ければ今までどおり棚を直接さわります。
 *   ＝ **鍵が直っても、窓口を落としても、どちらでも動きます。**
 *
 * ■ ここは通信の「言い換え」だけをします
 *   判断の中身（合言葉を作る・3項目を確かめる）は lib/keiri/tenants.ts のままです。
 */

/** 窓口を呼べる最小限の形（本物の Supabase でも、テストの作り物でも入る） */
export type RpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

/** 初回設定に渡すもの */
export type ActivateInput = {
  /** 初回設定の合言葉（URLの ?t=）。無ければ空文字 */
  token: string;
  /** 支払いの画面1回ぶんの番号（URLの ?session=）。無ければ空文字 */
  session: string;
  shopName: string;
  /** YYYY-MM-DD */
  openingDate: string;
  openingBalance: number;
  /** 管理画面の合言葉を戻せない形にしたもの（16進64文字） */
  adminPasswordHash: string;
};

export type ActivateResult =
  | { outcome: "ok"; tenantId: string; settingsOk: boolean }
  /** リンクが違う（そのお店が見つからない） */
  | { outcome: "not_found" }
  /** もう初回設定が終わっている */
  | { outcome: "already" }
  /** 窓口が無い、または呼べなかった */
  | { outcome: "unavailable"; reason: string };

/**
 * 窓口が「そもそも無い」のか「呼んだが失敗した」のかを見分ける。
 *
 * 無いときは、今までどおり棚を直接さわる道に落とします。
 * （倉庫に SQL を流す前・流したあとの両方で、同じコードが動くようにするため）
 */
export function isMissingFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  // PGRST202 = その名前の窓口が見つからない ／ 42883 = 関数が無い
  if (code === "PGRST202" || code === "42883") return true;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    msg.includes("could not find the function") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

/** 窓口が返した1行を取り出す（配列でも1件でも受ける） */
function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return (data[0] as Record<string, unknown>) ?? null;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

/**
 * 合言葉に当たったお店が「ちょうど1軒」のときだけ受け取る（kp177）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   合言葉は倉庫に「戻せない形」で置いてあり、入室のときは
 *   その形が一致するお店を引いて画面に入れています。
 *   ところが今までは、当たったお店が2軒以上あっても
 *   **先に見つかったほうに入れて**いました。
 *   ＝ もし2軒のお店の合言葉がたまたま同じになったら、
 *   よその店の帳簿が開いてしまいます。
 *
 * ■ ここでの決まり
 *   当たったお店が2軒以上なら、**どちらにも入れない**（＝入室を断る）。
 *   「合っているほうに入れる」より「間違ったほうに入れない」を優先します。
 *   お金の記録が他店に混ざるのは、入れないことより ずっと悪いためです。
 *
 * ■ 実際に起きるのか
 *   いまの合言葉は お店が決めるのではなく、**こちらで作って渡しています**
 *   （見間違えない31文字から12文字＝約79京通り。lib/keiri/tenants.ts）。
 *   したがって重なることは まず起きません。これは念のための止め木です。
 */
export function pickSingleTenant<T>(rows: readonly T[] | null | undefined): T | null {
  if (!rows || rows.length !== 1) return null;
  return rows[0] ?? null;
}

/** 初回設定を、窓口ごしに済ませる */
export async function activateTenantViaRpc(
  db: RpcClient,
  input: ActivateInput,
): Promise<ActivateResult> {
  const { data, error } = await db.rpc("keiri_tenant_activate", {
    p_token: input.token || null,
    p_session: input.session || null,
    p_shop_name: input.shopName,
    p_opening_date: input.openingDate,
    p_opening_balance: input.openingBalance,
    p_admin_password_hash: input.adminPasswordHash,
  });

  if (error) {
    return {
      outcome: "unavailable",
      reason: isMissingFunction(error) ? "窓口がまだありません" : String(error.message ?? "呼べませんでした"),
    };
  }

  const row = firstRow(data);
  // 0行＝どの店にも当たらなかった（窓口は「見つからない」を0行で返すことがある）
  if (!row) return { outcome: "not_found" };

  const outcome = String(row.outcome ?? "");
  if (outcome === "already") return { outcome: "already" };
  if (outcome !== "ok") return { outcome: "not_found" };

  const tenantId = String(row.tenant_id ?? "").trim();
  if (!tenantId) return { outcome: "not_found" };

  return { outcome: "ok", tenantId, settingsOk: row.settings_ok === true };
}

export type TenantLogin = { tenantId: string; shopName: string | null };

export type LoginResult =
  /** 合った（null＝合わなかった。どちらも「窓口は動いた」） */
  | { ok: true; tenant: TenantLogin | null }
  /** 窓口が無い・呼べなかった */
  | { ok: false; reason: string };

/** 合言葉を、窓口ごしに確かめる */
export async function loginTenantViaRpc(db: RpcClient, passwordHash: string): Promise<LoginResult> {
  const { data, error } = await db.rpc("keiri_tenant_login", { p_password_hash: passwordHash });

  if (error) {
    return {
      ok: false,
      reason: isMissingFunction(error) ? "窓口がまだありません" : String(error.message ?? "呼べませんでした"),
    };
  }

  // 2軒以上に当たったら、どちらにも入れない（kp177）
  if (Array.isArray(data) && data.length > 1) return { ok: true, tenant: null };

  const row = firstRow(data);
  if (!row) return { ok: true, tenant: null };

  const tenantId = String(row.tenant_id ?? "").trim();
  if (!tenantId) return { ok: true, tenant: null };

  const shopName = row.shop_name == null ? null : String(row.shop_name);
  return { ok: true, tenant: { tenantId, shopName } };
}

/**
 * 診断用：窓口が本番で使える状態かを、1回だけ叩いて確かめる。
 *
 * ★ 合うはずのない合言葉（0が64個）で叩きます。
 *   1行も書き込まず、誰にも知らせません。返ってくるのは必ず0行です。
 */
export async function probeTenantRpc(
  db: RpcClient,
): Promise<{ usable: boolean; reason: string | null }> {
  const result = await loginTenantViaRpc(db, "0".repeat(64));
  if (result.ok) return { usable: true, reason: null };
  return { usable: false, reason: result.reason };
}
