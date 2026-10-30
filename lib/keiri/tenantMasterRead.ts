/**
 * テストの店の「出店場所」を、**貼り紙⑬のあとでも読める形**で数えるところ
 *                                           （2026-10-29・kp266／f3-4・f5-4）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   貼り紙⑬は、出店場所・担当者・商品の棚に
 *   「**印が空の行だけ 読んでよい**」という決まりを足します。
 *   手羽屋の行は印が空なので今までどおりですが、
 *   **テストの店の行（印が付いた行）は、公開の鍵では読めなくなります**。
 *
 *   2軒目を入れる手順の確かめ（手順4）は、いま公開の鍵で
 *   「そのお店の出店場所が1件 入っているか」を読んでいます。
 *   ⑬を流したあと、ここを直さないと
 *     ・手順4 が「まだです」に見える（実際は入っている）
 *     ・通す側（run）が「まだ無い」と思って**同じ行をもう1件 足す**
 *   という2つが起きます。後者は本番に要らない行が増えるので、先に直します。
 *
 * ■ どう直すか
 *   ⑬で対になって作られる**倉庫の窓口**（keiri_tenant_locations）ごしに読みます。
 *   窓口がまだ無いあいだ（＝貼り紙を流す前）は、今までどおり公開の鍵で読みます。
 *   ＝ **流す前も流したあとも、同じ答えが出ます。**
 *
 * ★読むだけです。1行も書き込みません。
 * ★返すのは「あるか／無いか」と、読めなかったかどうかだけ。金額は1円も扱いません。
 */

import { applyTenantScope } from "@/lib/tenantScope";
import { isMissingFunction } from "@/lib/keiri/tenantAccess";
import { TENANT_LOCATIONS_WINDOW, TENANT_PRODUCTS_WINDOW } from "@/lib/keiri/shelfScope";
import { TEST_SHOP } from "@/lib/keiri/tenantTrial";

/** 倉庫に聞ける物の、ここで使う最小の形（テストで偽物を渡せるようにしてある） */
type Db = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: any }>;
  from: (table: string) => any;
};

export type TestShopLocationRead = {
  /** その名前の出店場所が、そのお店にあるか */
  found: boolean;
  /** 読めなかった（答えを信じてはいけない） */
  unreadable: boolean;
  /** どちらの道で読んだか（外から見て分かるように残す） */
  via: "window" | "anon" | "none";
};

/** 窓口が返した行から、名前だけを取り出す（中身の形が変わっても落ちないように包む） */
export function namesFromWindowRows(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const out: string[] = [];
  for (const row of data) {
    if (row && typeof row === "object" && "name" in (row as Record<string, unknown>)) {
      const n = (row as Record<string, unknown>).name;
      if (typeof n === "string") out.push(n);
    }
  }
  return out;
}

/**
 * テストの店に、その名前の出店場所が1件あるかを見る。
 * 窓口があればそちら、無ければ今までどおり公開の鍵で読む。
 */
export async function findTestShopLocation(
  db: Db,
  tenantId: string,
  name: string,
): Promise<TestShopLocationRead> {
  // ① 倉庫の窓口ごし（貼り紙⑬のあとはこちらだけが通る）
  try {
    const { data, error } = await db.rpc(TENANT_LOCATIONS_WINDOW, {
      p_password_hash: null,
      p_from: null,
      p_to: null,
      p_test_mark: TEST_SHOP.mark,
    });
    if (!error) {
      return { found: namesFromWindowRows(data).includes(name), unreadable: false, via: "window" };
    }
    // 窓口がまだ無い＝貼り紙を流す前。②へ落ちる
    if (!isMissingFunction(error)) {
      return { found: false, unreadable: true, via: "none" };
    }
  } catch {
    return { found: false, unreadable: true, via: "none" };
  }

  // ② 今までどおり公開の鍵で読む（貼り紙を流す前だけ通る道）
  try {
    const { data, error } = await applyTenantScope<any>(
      db.from("locations").select("id") as any,
      tenantId,
    )
      .eq("name", name)
      .limit(1);
    if (error) return { found: false, unreadable: true, via: "anon" };
    return { found: (data?.length ?? 0) > 0, unreadable: false, via: "anon" };
  } catch {
    return { found: false, unreadable: true, via: "anon" };
  }
}


/* ------------------------------------------------------------------ *
 *  商品（名前と単価）も同じ道で読む（2026-10-30・kp269／f5-4・f3-4）
 * ------------------------------------------------------------------ *
 *
 * ■ なぜ要るのか（やさしい説明）
 *   2軒目を入れる手順で、そのお店の商品を1件 入れるようにしました
 *   （日報の STEP4 ＝「単価 × 本数」と売上の突き合わせを、2軒目でも1回 通すため）。
 *   出店場所とまったく同じ事情で、⑬のあとは**公開の鍵では読めません**。
 *   読めないまま「まだ無い」と思うと、**同じ商品をもう1件 足してしまいます**。
 *   そこで出店場所と同じ1か所にまとめます（窓口 → 無ければ公開の鍵）。
 */

/** 窓口が返した行から、名前と単価だけを取り出す（形が変わっても落ちないように包む） */
export function pricedNamesFromWindowRows(data: unknown): { name: string; price: number }[] {
  if (!Array.isArray(data)) return [];
  const out: { name: string; price: number }[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.name !== "string") continue;
    const price = Number(r.price);
    out.push({ name: r.name, price: Number.isFinite(price) ? price : 0 });
  }
  return out;
}

export type TestShopProductRead = TestShopLocationRead & {
  /** その商品の単価（見つからなかったときは null） */
  price: number | null;
};

/**
 * テストの店に、その名前の商品が1件あるかを見る。
 * 窓口があればそちら、無ければ今までどおり公開の鍵で読む。
 */
export async function findTestShopProduct(
  db: Db,
  tenantId: string,
  name: string,
): Promise<TestShopProductRead> {
  // ① 倉庫の窓口ごし（貼り紙⑬のあとはこちらだけが通る）
  try {
    const { data, error } = await db.rpc(TENANT_PRODUCTS_WINDOW, {
      p_password_hash: null,
      p_from: null,
      p_to: null,
      p_test_mark: TEST_SHOP.mark,
    });
    if (!error) {
      const hit = pricedNamesFromWindowRows(data).find((r) => r.name === name);
      return {
        found: Boolean(hit),
        price: hit ? hit.price : null,
        unreadable: false,
        via: "window",
      };
    }
    if (!isMissingFunction(error)) {
      return { found: false, price: null, unreadable: true, via: "none" };
    }
  } catch {
    return { found: false, price: null, unreadable: true, via: "none" };
  }

  // ② 今までどおり公開の鍵で読む（貼り紙を流す前だけ通る道）
  try {
    const { data, error } = await applyTenantScope<any>(
      db.from("sale_products").select("id, price") as any,
      tenantId,
    )
      .eq("name", name)
      .limit(1);
    if (error) return { found: false, price: null, unreadable: true, via: "anon" };
    const row = (data ?? [])[0] as { price?: unknown } | undefined;
    const price = Number(row?.price);
    return {
      found: Boolean(row),
      price: row && Number.isFinite(price) ? price : null,
      unreadable: false,
      via: "anon",
    };
  } catch {
    return { found: false, price: null, unreadable: true, via: "anon" };
  }
}

/**
 * 窓口が返した行を、日報の画面がそのまま使える形（商品マスタの1行）に直す。
 *
 * ★窓口は `shop`（手羽屋／もも屋）を返しません（そのお店の商品ぜんぶを返す窓口のため）。
 *   日報の画面は開いているお店の `shop` で商品を絞るので、ここで開いているお店を入れます。
 * ★`is_active` が false の行は落とします（画面と同じ扱い）。
 */
export function saleProductsFromWindowRows(
  data: unknown,
  shop: string,
): {
  id: number;
  shop: string;
  name: string;
  price: number;
  kind: "primary" | "normal" | "count_only";
  is_active: boolean;
  sort_order: number;
}[] {
  if (!Array.isArray(data)) return [];
  const out: ReturnType<typeof saleProductsFromWindowRows> = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.name !== "string") continue;
    if (r.is_active === false) continue;
    const kind =
      r.kind === "primary" || r.kind === "count_only" ? r.kind : "normal";
    out.push({
      id: Number(r.id) || 0,
      shop,
      name: r.name,
      price: Number(r.price) || 0,
      kind,
      is_active: true,
      sort_order: Number(r.sort_order) || 0,
    });
  }
  return out.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}
