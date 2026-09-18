/**
 * 「全角が混ざった鍵を、確かめられる範囲だけ直す」しくみのテスト（2026-09-19・kp67）。
 *
 * ■ なぜ要るか
 *   本番の SUPABASE_SERVICE_ROLE_KEY に全角が混ざっていて（kp54）、
 *   お申し込みの控え・サイトに来た人の数・手羽屋の毎日のバックアップが止まっている。
 *
 * ■ ここで必ず守ること
 *   直すのは「全角→半角」の決まりどおりの置き換えだけ。
 *   そのうえで **鍵の形（この倉庫の service_role）を確かめてからでないと使わない。**
 *   確かめられなければ、今までどおり「壊れている」と正直に出す。
 *   ＝ 推測で鍵を作り変えることは、絶対にしない。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  countBrokenChars,
  repairWideChars,
  looksLikeServiceRoleKey,
  projectRefFromUrl,
  serviceRoleKeyRepair,
} from "../lib/supabaseServer";

const URL_OK = "https://vtuyebyjbvjmucqpkxug.supabase.co";

/** 試験用の鍵を組み立てる（本物の鍵はどこにも書かない） */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.QUJDZGVmMTIzNDU2Nzg5MC1fYWJj`;
}

const GOOD = jwt({ iss: "supabase", ref: "vtuyebyjbvjmucqpkxug", role: "service_role" });

/** 半角の英数字を、見た目が同じ全角に置き換える（貼り付けのしそこないを再現する） */
function toWide(s: string): string {
  return s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}

test("使えない文字の数と、そのうち半角に直せる数を数える（値そのものは扱わない）", () => {
  assert.deepEqual(countBrokenChars("abc"), { count: 0, convertible: 0 });
  // 全角の英数字は直せる
  assert.deepEqual(countBrokenChars("abＣd"), { count: 1, convertible: 1 });
  // 全角カッコは半角の ( になるので「直せる」側に数える（形の確認で弾かれる）
  const paren = countBrokenChars("ab（cd");
  assert.equal(paren.count, 1);
  // 日本語は半角にならない＝直せない
  assert.deepEqual(countBrokenChars("abあc"), { count: 1, convertible: 0 });
});

test("全角の英数字は、決まりどおり半角に戻る", () => {
  assert.equal(repairWideChars("ａｂＣ１２"), "abC12");
  assert.equal(repairWideChars("abc"), "abc"); // もともと半角なら何も変わらない
});

test("倉庫の名前を URL から読み取れる", () => {
  assert.equal(projectRefFromUrl(URL_OK), "vtuyebyjbvjmucqpkxug");
  assert.equal(projectRefFromUrl("https://example.com"), null);
});

test("鍵の形：この倉庫の service_role だけを通す", () => {
  assert.equal(looksLikeServiceRoleKey(GOOD, URL_OK), true);
  // 役割が違う（ブラウザにも配る通常の鍵）
  assert.equal(
    looksLikeServiceRoleKey(jwt({ ref: "vtuyebyjbvjmucqpkxug", role: "anon" }), URL_OK),
    false,
  );
  // よその倉庫の鍵
  assert.equal(
    looksLikeServiceRoleKey(jwt({ ref: "someoneelse", role: "service_role" }), URL_OK),
    false,
  );
  // そもそも鍵の形をしていない
  assert.equal(looksLikeServiceRoleKey("not-a-key", URL_OK), false);
  assert.equal(looksLikeServiceRoleKey("a.b.c", URL_OK), false);
});

/** 環境変数をその試験のあいだだけ差し替える */
function withEnv(key: string | undefined, fn: () => void) {
  const before = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const beforeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_OK;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = before;
    if (beforeUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = beforeUrl;
  }
}

test("そのまま使える鍵は、直さずにそのまま使う", () => {
  withEnv(GOOD, () => {
    const r = serviceRoleKeyRepair();
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.repaired, false);
      assert.equal(r.key, GOOD);
    }
  });
});

test("全角が混ざっているだけなら、半角に直して使える（今回の直しの本体）", () => {
  // 貼り付けのときに一部が全角になってしまった状態
  const broken = GOOD.slice(0, 10) + toWide(GOOD.slice(10, 20)) + GOOD.slice(20);
  withEnv(broken, () => {
    const r = serviceRoleKeyRepair();
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.repaired, true);
      assert.equal(r.key, GOOD); // 元の鍵にぴったり戻っている
      assert.ok(r.broken.count > 0);
    }
  });
});

test("直しても鍵の形にならないものは、使わずに『壊れている』と出す", () => {
  withEnv("eyJhbGciOiJ（あいうえお", () => {
    const r = serviceRoleKeyRepair();
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "全角などの使えない文字が入っている");
      assert.equal(r.repaired, false);
    }
  });
});

test("よその倉庫の鍵に化けるような直し方はしない", () => {
  const other = jwt({ ref: "otherproject", role: "service_role" });
  withEnv(toWide(other), () => {
    const r = serviceRoleKeyRepair();
    assert.equal(r.ok, false, "倉庫の名前が違う鍵は、直せても使わない");
  });
});

test("役割が service_role でない鍵には化けさせない", () => {
  const anon = jwt({ ref: "vtuyebyjbvjmucqpkxug", role: "anon" });
  withEnv(toWide(anon), () => {
    assert.equal(serviceRoleKeyRepair().ok, false);
  });
});

test("未設定は、今までどおり『未設定』のまま（直しの話にしない）", () => {
  withEnv(undefined, () => {
    const r = serviceRoleKeyRepair();
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "未設定");
  });
});
