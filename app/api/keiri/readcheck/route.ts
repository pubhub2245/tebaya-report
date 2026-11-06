import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { serverClient } from "@/lib/supabaseServer";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { resolveReadScope } from "@/lib/keiri/readScope";
import { canFallbackToBrowserOnUnavailable } from "@/lib/keiri/readSource";
import { probeTenantRpc } from "@/lib/keiri/tenantAccess";
import { probeWarehouseAlive } from "@/lib/keiri/warehouseAlive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「お店の数字を読む窓口が、名乗っただけの相手を入れないか」を
 * **外から確かめられる**ようにする窓口（kp239・f3-4）。
 *
 * ■ なぜ要るか
 *   経理の数字をサーバー側で読む窓口（/api/keiri/month）は、
 *   お店の番号を受け取らず、合言葉から どのお店かを決めます。
 *   ところがそれは **合言葉を持っている人しか確かめられません**。
 *   検査役（B2）は合言葉を持たないので、直すところを「できた」と言われても
 *   自分で確かめられない状態でした。
 *   そこで、合言葉を1文字も使わずに確かめられる形にしました。
 *
 * ■ ここでやること（読むだけ・書き込みゼロ）
 *   ① 倉庫の窓口（お店を合言葉から探す窓口）が生きているか
 *      ★当たるはずのない合言葉（0が64個）で1回だけ叩きます。必ず0行が返ります。
 *   ② でっちあげた合言葉では入れないか（断るか）
 *   ③ 形になっていない値では、倉庫を叩く前に断るか
 *   ④ ★窓口に聞けないとき、お店の経理画面が**ブラウザ直読みに落ちない**か
 *      （2026-11-06 追加。ここは通信をしない ただの決まりなので、
 *        **倉庫が止まっている日でも測れます**。f3-4 の中身そのもの）
 *
 * ■ 返さないもの
 *   金額・お店の名前・連絡先・合言葉・鍵の値は**1文字も返しません**。
 */

/** 当たるはずのない合言葉（16進64文字） */
const IMPOSSIBLE = "0".repeat(64);

export async function GET() {
  // fresh ＝ 前の答えをためずに毎回 取りに行く（2026-11-06・f3-4）
  const db = serverClient({ fresh: true });

  // ⓪ 対照：同じつなぎ方で手羽屋の行が1件でも見えるか（2026-11-06・f3-4）
  //
  //   ここが要るのは、**断られたことが合格の材料になっている**からです。
  //   倉庫に届かないとき、でっちあげた合言葉は「決まりが働いたから」ではなく
  //   「倉庫に聞けなかったから」断られます。それを ok: true と答えると、
  //   **止まっているのに合格**になります（2026-11-06 の朝、本番でそうなっていました）。
  const warehouse = await probeWarehouseAlive(db as any);

  // ① 倉庫の窓口が生きているか
  const probe = await probeTenantRpc(db as any);

  // ② でっちあげた合言葉。手羽屋の合言葉と比べても当たらない値を使う
  const tebayaPassword = (process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "").trim();
  const tebayaHash = tebayaPassword
    ? createHash("sha256").update(tebayaPassword, "utf8").digest("hex")
    : "";

  const made = await resolveReadScope({
    passwordHash: IMPOSSIBLE,
    tebayaHash,
    rpc: db as any,
  });

  // ③ 形になっていない値（これは倉庫を叩かずに断るのが正しい）
  const malformed = await resolveReadScope({
    passwordHash: "こんにちは",
    tebayaHash,
    rpc: db as any,
  });

  // ★「断った」と「聞けなかった」を取り違えない（2026-11-06・f3-4）。
  //   倉庫が止まっている日、でっちあげた合言葉は「決まりが働いたから」ではなく
  //   「倉庫に聞けなかったから」通りません。それを ○ と書くのも × と書くのも嘘になります。
  //   null ＝ いまは確かめられなかった、とだけ答えます。
  const madeUpSecretDenied: boolean | null =
    made.outcome === "denied"
      ? true
      : made.outcome === "unavailable"
      ? null
      : false;

  // ★倉庫が止まっていても確かめられる決まり（2026-11-06・f3-4）。
  //   窓口に聞けなかったとき、お店の経理画面は**今までどおりの読み方に戻りません**
  //   （何も出さずに止まります）。戻るのは手羽屋だけ＝戻った先が手羽屋の帳簿そのもの。
  //   ここは通信をしない ただの決まりなので、**倉庫が止まっている日でも測れます。**
  const shopStopsWhenWindowUnavailable =
    canFallbackToBrowserOnUnavailable("11111111-2222-3333-4444-555555555555") === false &&
    canFallbackToBrowserOnUnavailable(null) === true;

  const checks = {
    /** 倉庫の窓口が生きている（合言葉からお店を探せる） */
    loginWindowAlive: probe.usable,
    /** でっちあげた合言葉では入れない（null ＝ いまは確かめられなかった） */
    madeUpSecretDenied,
    /** 形になっていない値も入れない */
    malformedDenied: malformed.outcome === "denied",
    /** 手羽屋の合言葉が設定されている（未設定だと誰も入れない） */
    tebayaSecretConfigured: tebayaHash !== "",
    /** ★窓口に聞けないとき、お店の画面は止まる（ブラウザ直読みに落ちない）。倉庫が止まっていても測れる */
    shopStopsWhenWindowUnavailable,
  };

  const problems: string[] = [];
  if (!checks.loginWindowAlive) {
    problems.push(
      "倉庫の窓口（合言葉からお店を探す窓口）が呼べません。" +
        "このあいだ お店の経理画面は、今までどおりの読み方に戻らず**何も出さずに止まります**" +
        "（戻るのは手羽屋だけ＝戻った先が手羽屋の帳簿そのものです）",
    );
  }
  // ★ null（いまは確かめられなかった）を「入れてしまいます」と書かない
  if (checks.madeUpSecretDenied === false) {
    problems.push("でっちあげた合言葉で入れてしまいます");
  } else if (checks.madeUpSecretDenied === null) {
    problems.push(
      "でっちあげた合言葉を断るかは、いまは確かめられませんでした" +
        "（倉庫に聞けないので「断った」のか「聞けなかった」のか分けられません）",
    );
  }
  if (!checks.malformedDenied) problems.push("形になっていない値で入れてしまいます");
  if (!checks.tebayaSecretConfigured) problems.push("手羽屋の合言葉が未設定です");
  if (!checks.shopStopsWhenWindowUnavailable) {
    problems.push(
      "窓口に聞けないときに、お店の経理画面がブラウザから倉庫を直に読む道に落ちます（f3-4）",
    );
  }

  // ★倉庫が読めていないときは、上の○×に意味がありません（＝測れない）
  const measurable = warehouse.alive;
  if (!measurable) problems.unshift(`いまは測れません：${warehouse.reason}`);

  // null ＝ 測れなかった。**合格にも不合格にもしません**
  const ok: boolean | null = measurable ? problems.length === 0 : null;

  return NextResponse.json(
    stampCheckWindow({
      ok,
      measurable,
      warehouse: { alive: warehouse.alive, state: warehouse.state, reason: warehouse.reason },
      checks,
      problems,
      summary: !measurable
        ? `いまは測れませんでした（${warehouse.reason}）。` +
          "合格にも不合格にもしていません。倉庫が読めるようになってから、もう一度 開いてください。" +
          `｜倉庫が止まっていても測れることが1つあります：窓口に聞けないとき、お店の経理画面は${
            checks.shopStopsWhenWindowUnavailable
              ? "何も出さずに止まります（ブラウザ直読みには落ちません）"
              : "ブラウザから倉庫を直に読む道に落ちます（ここが開いています）"
          }。`
        : ok
        ? "お店の数字を読む窓口（/api/keiri/month）は、合言葉から お店を決めています。" +
          "でっちあげた合言葉・形になっていない値は、どちらも断りました。" +
          "画面から送られてきたお店の番号は受け取りません（受け取る道がコードにありません）。"
        : `確かめられなかったことがあります：${problems.join("／")}`,
      note:
        "読むだけの窓口です。金額・お店の名前・連絡先・合言葉・鍵の値は1文字も返しません。" +
        "お店ごとに棚の鍵で守るところ（倉庫の決まりを絞る）は、まだ残っています。",
      remaining:
        "ブラウザから倉庫を直に読む道は、棚の鍵の決まりを1回 流すまで閉じられません（f3-4 はまだ合格ではありません）",
    }),
    { headers: CHECK_WINDOW_HEADERS },
  );
}
