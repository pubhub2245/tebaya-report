import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isHashShape, resolveReadScope, sameHash } from "../lib/keiri/readScope";

/**
 * 「どのお店の帳簿を読むか」を **サーバー側で決める** 決まりを固定する（kp239・f3-4）。
 *
 * ■ ここで守りたいこと
 *   ① **画面が名乗ったお店の番号は、絶対に信じない。**
 *      番号を受け取る道があると、書き換えてよその店の帳簿を開けてしまう。
 *   ② 合わなかったときの返事は1種類だけ（お店がある／無いを外に出さない）。
 *   ③ 倉庫の窓口がまだ無い倉庫では「断る」ではなく「今までの読み方に戻れる」と返す。
 *      ここを間違えると、払ったお店が画面を開けなくなる。
 */

const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** 倉庫の窓口の作り物。呼ばれた引数も覚えておく */
function fakeRpc(opts: {
  rows?: unknown;
  error?: { message?: string; code?: string } | null;
  calls?: { fn: string; args: Record<string, unknown> }[];
}) {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      opts.calls?.push({ fn, args });
      return Promise.resolve({ data: opts.rows ?? null, error: opts.error ?? null });
    },
  };
}

test("手羽屋の合言葉なら、手羽屋（印が空）として読む", async () => {
  const r = await resolveReadScope({
    passwordHash: hash("tebaya-pw"),
    tebayaHash: hash("tebaya-pw"),
    rpc: fakeRpc({}),
  });
  assert.equal(r.outcome, "tebaya");
  assert.equal(r.outcome === "tebaya" ? r.scope : "x", null);
});

test("申し込んだお店の合言葉なら、そのお店として読む", async () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const r = await resolveReadScope({
    passwordHash: hash("shop-pw"),
    tebayaHash: hash("tebaya-pw"),
    rpc: fakeRpc({ rows: [{ tenant_id: id, shop_name: "デモ食堂" }] }),
  });
  assert.equal(r.outcome, "tenant");
  assert.equal(r.outcome === "tenant" ? r.scope : null, id);
});

test("合言葉が当たらなければ断る（理由は1種類だけ）", async () => {
  const r = await resolveReadScope({
    passwordHash: hash("nope"),
    tebayaHash: hash("tebaya-pw"),
    rpc: fakeRpc({ rows: [] }),
  });
  assert.equal(r.outcome, "denied");
});

test("同じ合言葉のお店が2軒以上なら、どちらにも入れない", async () => {
  const r = await resolveReadScope({
    passwordHash: hash("dup"),
    tebayaHash: "",
    rpc: fakeRpc({
      rows: [
        { tenant_id: "11111111-2222-3333-4444-555555555555" },
        { tenant_id: "66666666-7777-8888-9999-000000000000" },
      ],
    }),
  });
  assert.equal(r.outcome, "denied");
});

test("戻せない形になっていない値は、窓口に聞く前に断る", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  for (const bad of ["", "   ", "abc", hash("x").slice(0, 63), hash("x") + "0", "../../etc"]) {
    const r = await resolveReadScope({
      passwordHash: bad,
      tebayaHash: hash("tebaya-pw"),
      rpc: fakeRpc({ calls }),
    });
    assert.equal(r.outcome, "denied", `受け付けてしまった：${bad}`);
  }
  assert.equal(calls.length, 0, "形がおかしい値で倉庫を叩いてはいけない");
});

test("倉庫の窓口がまだ無い倉庫では、断らずに『今までの読み方に戻れる』と返す", async () => {
  const r = await resolveReadScope({
    passwordHash: hash("shop-pw"),
    tebayaHash: "",
    rpc: fakeRpc({ error: { code: "PGRST202", message: "Could not find the function" } }),
  });
  assert.equal(r.outcome, "unavailable");
});

test("手羽屋の合言葉が未設定でも、空文字では入れない", async () => {
  const r = await resolveReadScope({
    passwordHash: "",
    tebayaHash: "",
    rpc: fakeRpc({ rows: [] }),
  });
  assert.equal(r.outcome, "denied");
});

test("戻せない形の見分けと比べ方", () => {
  assert.equal(isHashShape(hash("a")), true);
  assert.equal(isHashShape("ZZ" + hash("a").slice(2)), false);
  assert.equal(sameHash(hash("a"), hash("a")), true);
  assert.equal(sameHash(hash("a"), hash("b")), false);
  // 形がおかしいものは、たとえ同じ文字でも「合った」にしない
  assert.equal(sameHash("abc", "abc"), false);
});

test("月の窓口は、お店の番号を受け取らない（コードに入口を作らない）", () => {
  const src = readFileSync(join(__dirname, "..", "app", "api", "keiri", "month", "route.ts"), "utf8");
  // 画面から送られてきた値を読むのは ym と passwordHash の2つだけ
  const reads = Array.from(src.matchAll(/body\.(\w+)/g)).map((m) => m[1]);
  assert.deepEqual([...new Set(reads)].sort(), ["passwordHash", "ym"]);
  assert.ok(!/body\.(tenant|scope|businessCode)/i.test(src), "番号を受け取る道があってはいけない");
  // 書き込みをしない窓口であること（読むのは loadKeiriMonthServer に任せる）
  for (const w of [".insert(", ".upsert(", ".delete(", ".from("]) {
    assert.ok(!src.includes(w), `読むだけの窓口に棚をいじる道が入っている：${w}`);
  }
});
