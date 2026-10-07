/**
 * 経理の画面が「どのお店の帳簿を読むか」を決める、ただ1か所のファイル（kp239・f3-4）。
 *
 * ■ 何が起きていたか（やさしい説明）
 *   経理の画面（/keiri・/keiri/monthly）には、お店を決める札が**2つ**ありました。
 *
 *   ① 入室の印（`keiri-shop-auth`）… 合言葉を入れて入ったときにだけ付く。タブを閉じれば消える
 *   ② 端末の控え（`keiri-tenant-id`）… 日報にどのお店の印を付けるかの控え。閉じても残る
 *
 *   画面は ①で入れてもらい、**②を見て読んでいました**。
 *   ところが②は別の置き場なので、①と食い違うことがあります。
 *   ②が空のときは「手羽屋」と見なす作りなので、
 *   **お店として入ったのに、手羽屋の売上・経費・利益が画面に出ます。**
 *   作り物の攻撃ではなく、ふつうに起きます。たとえば
 *   ・端末の控えだけが使えない設定（プライベート表示など）で、②の書き込みだけが失敗する
 *   ・②だけを消した（サイトのデータを部分的に消した・別のタブで手羽屋として入り直した）
 *
 * ■ どう直すか
 *   **読む相手は①（入室の印）だけで決めます。** ②は日報の印のための控えなので、
 *   帳簿を読む相手には使いません。①が無ければ、そもそもお店としては入っていないので
 *   手羽屋（今までどおり）です。
 *
 * ■ 手羽屋は1行も変わりません
 *   手羽屋は①を持たない（＝印が空）ので、これまでどおり手羽屋として読みます。
 *   日報・シフト・レジ・LINE・お金の計算には触っていません。
 *
 * ■ ここは通信もブラウザも要りません
 *   置き場を外から渡せる形にしてあるので、テストで作り物を渡して確かめられます。
 */

import { normalizeTenantScope, TEBAYA_SCOPE, type TenantScope } from "../tenantScope";

/**
 * 「合言葉を入れて、このお店として入った」という入室の印。
 * ★ app/components/AdminGate.tsx はこの名前をここから読みます（2か所に書くと食い違うため）。
 */
export const KEIRI_SHOP_AUTH_KEY = "keiri-shop-auth";

/** 置き場の最小の形（テストで作り物を渡せるように） */
type Reader = Pick<Storage, "getItem">;

function sessionReader(store?: Reader): Reader | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * いま「どのお店として入っているか」を、入室の印だけから決める。
 * 印が無い・形が違う ＝ 手羽屋（null）。
 */
export function readAuthedKeiriScope(store?: Reader): TenantScope {
  const s = sessionReader(store);
  if (!s) return TEBAYA_SCOPE;
  try {
    return normalizeTenantScope(s.getItem(KEIRI_SHOP_AUTH_KEY));
  } catch {
    return TEBAYA_SCOPE;
  }
}

/** どこから読むか */
export type ReadSource =
  /** サーバー側の窓口（/api/keiri/month）から読む。お店はこちら */
  | "server"
  /** ブラウザから倉庫を直接のぞく。**手羽屋だけ**（今までどおり） */
  | "browser";

/**
 * 読む先を決める（計算だけ）。
 *
 * ・お店として入っている（印がある）なら必ず窓口。番号を書き換えても、
 *   窓口は合言葉から店を決めるので、よその帳簿は開きません。
 * ・手羽屋は今までどおりブラウザから。
 */
export function decideReadSource(scope: TenantScope): ReadSource {
  return normalizeTenantScope(scope) === null ? "browser" : "server";
}

/** 窓口に聞いた結果の読み分け */
export type WindowOutcome =
  /** 読めた */
  | { kind: "ok" }
  /** 合言葉が合わない（401）。**ここで止める**。ブラウザ直読みに落とさない */
  | { kind: "denied" }
  /** 窓口がまだ無い・通信できない（503 など）。今までどおりの読み方に戻る */
  | { kind: "unavailable" };

/**
 * 窓口の返事（HTTPの番号）を、どう扱うかに直す。
 *
 * ★ここを分けるのが肝です。
 *   「合言葉が合わない」で今までどおりの読み方に戻すと、
 *   **合っていない人に、その番号のお店の帳簿を出してしまいます**。
 *   合わないときは何も出さない。出せないときだけ戻る。
 */
export function readWindowOutcome(status: number, body: unknown): WindowOutcome {
  const ok = !!(body as { ok?: unknown } | null)?.ok;
  if (status >= 200 && status < 300 && ok) return { kind: "ok" };
  if (status === 401 || status === 403) return { kind: "denied" };
  return { kind: "unavailable" };
}

/* ------------------------------------------------------------------ *
 *  「お店として入っているのに、手羽屋と見なされる」をふさぐ（2026-10-07・kp239）
 * ------------------------------------------------------------------ */

/**
 * 経理の画面で「いまどのお店か」を決めるときの、安全側の決め方。
 *
 * ■ なぜ2つを合わせて見るのか（やさしい説明）
 *   入室の印（このタブ）と端末の控え（localStorage）は別の置き場なので、
 *   食い違うことがあります。食い違ったときに **手羽屋のほうへ倒れる**のが危ない形です。
 *   ・読むとき … 手羽屋の売上・経費・利益が、お店の画面に出てしまう
 *   ・書くとき … お店が入れた立替が、**手羽屋の本物の帳簿に混ざってしまう**
 *
 *   そこで「どちらかがお店だと言っているなら、お店として扱う」ことにします。
 *   締める側にしか倒れないので、ゆるくなることはありません。
 *
 * ■ 手羽屋は1つも変わりません（ここが大事）
 *   手羽屋には入室の印が付きません（手羽屋の合言葉で入ると必ず捨てられます）。
 *   印が無いときの答えは、**端末の控えをそのまま返すだけ**なので、
 *   これまでと1文字も変わりません（tests/keiriReadSource.test.ts で固定）。
 *
 * @param deviceScope 端末の控え（lib/tenantScope.ts の readTenantScope() の答え）
 * @param store       入室の印の置き場（既定はこのタブの sessionStorage）
 */
export function effectiveKeiriScope(
  deviceScope: TenantScope,
  store?: Reader,
): TenantScope {
  const authed = readAuthedKeiriScope(store);
  return authed ?? normalizeTenantScope(deviceScope);
}
