/**
 * 「いま読もうとしているのは、どのお店の帳簿か」を **サーバー側で決める** ところ（kp239・f3-4）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   経理の画面（/keiri）は、いままで**ブラウザから倉庫を直接のぞいて**数字を作っていました。
 *   どのお店として読むかは、ブラウザが自分で覚えている「お店の番号」で決めていました。
 *   ＝ **画面が名乗った番号を、そのまま信じていた** ことになります。
 *   番号を書き換えれば、よそのお店の帳簿が開けてしまう形です。
 *
 *   そこで読む道をサーバー側に移し、**お店の番号は合言葉から決める**ようにします。
 *   画面から送られてきた番号は、ここでは**一切 受け取りません**。
 *
 * ■ ここがやること
 *   ① 送られてきたのが「手羽屋の合言葉」なら手羽屋として読む
 *   ② そうでなければ、倉庫の窓口（keiri_tenant_login）に聞いて、そのお店として読む
 *   ③ どちらでもなければ **断る**（お店がある／無いは返さない）
 *
 * ■ 送るのは合言葉そのものではなく「戻せない形」（16進64文字）
 *   倉庫に置いてあるのも同じ形なので、窓口にそのまま渡せます。
 *   合言葉の文字そのものは、この道を1度も通りません。
 *
 * ■ ここは通信をしません
 *   窓口を呼ぶ物（rpc）を外から渡してもらう形にしてあるので、
 *   テストでは作り物を渡して確かめられます。
 */

import { normalizeTenantScope, TEBAYA_SCOPE, type TenantScope } from "@/lib/tenantScope";
import { loginTenantViaRpc, type RpcClient } from "./tenantAccess";

/** 戻せない形（sha256 の16進64文字）だけを受け付ける */
const HASH_RE = /^[0-9a-f]{64}$/;

export type ReadScopeResult =
  /** 手羽屋として読んでよい */
  | { outcome: "tebaya"; scope: TenantScope }
  /** そのお店として読んでよい */
  | { outcome: "tenant"; scope: TenantScope }
  /** 合言葉が合わない。**理由は1つに揃える**（お店がある／無いを外に出さない） */
  | { outcome: "denied" }
  /**
   * 倉庫の窓口がまだ無い／呼べなかった。
   * ★このときは「読めない」ではなく、画面側が今までどおりの道に戻れるように
   *   それが分かる返事をする（お店が締め出されないため）。
   */
  | { outcome: "unavailable"; reason: string };

/** 中身を推測されないように、長さが同じなら時間が変わらない比べ方をする */
export function sameHash(a: string, b: string): boolean {
  if (!HASH_RE.test(a) || !HASH_RE.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** 送られてきた値が、戻せない形として使えるか */
export function isHashShape(raw: unknown): boolean {
  return HASH_RE.test(String(raw ?? "").trim().toLowerCase());
}

/**
 * どのお店として読むかを決める。
 *
 * @param passwordHash 画面から送られてきた「戻せない形」の合言葉
 * @param tebayaHash   手羽屋の合言葉を同じ形にしたもの（無ければ空文字）
 * @param rpc          倉庫の窓口を呼べる物
 */
export async function resolveReadScope(params: {
  passwordHash: unknown;
  tebayaHash: string;
  rpc: RpcClient;
}): Promise<ReadScopeResult> {
  const hash = String(params.passwordHash ?? "").trim().toLowerCase();
  if (!isHashShape(hash)) return { outcome: "denied" };

  // ① 手羽屋。いままでどおり、手羽屋は印を持たないお店として読む
  if (params.tebayaHash && sameHash(hash, params.tebayaHash)) {
    return { outcome: "tebaya", scope: TEBAYA_SCOPE };
  }

  // ② 申し込んだお店。倉庫の窓口に聞く（サーバー側の合鍵が壊れていても通る道）
  const viaRpc = await loginTenantViaRpc(params.rpc, hash);
  if (!viaRpc.ok) return { outcome: "unavailable", reason: viaRpc.reason };

  const tenantId = normalizeTenantScope(viaRpc.tenant?.tenantId);
  if (!viaRpc.tenant || !tenantId) return { outcome: "denied" };

  return { outcome: "tenant", scope: tenantId };
}
