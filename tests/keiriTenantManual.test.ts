import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * 経理パッケージ：**最初の1件が決まった日に、お店1軒ぶんの行を手で作る道**の検算（kp176）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   サーバー側の合鍵が壊れているあいだ（kp55）、お申し込みが決まっても
 *   「お店1軒ぶんの行」は自動では作れません。その日は人が手で1行だけ作ります。
 *   ところがその道が **2つ** ありました：
 *     方法A … 倉庫にすでに入っている窓口を1行呼ぶ（店名を書き換えるのは1か所）
 *     方法B … 生の INSERT を流す（店名を書き換えるのは **2か所**）
 *   そして じゅん／A に渡していた手順は、あとから作った **方法B のほう**でした。
 *   片方だけ書き換えると、二重に作らないための見張りが効きません。
 *   いちばん高くつく日の手順なので、**安全なほうを先に書く**ことを固定します。
 *
 * ■ ここで固定すること
 *   ① 手順書がすすめるのは、窓口を1行呼ぶ方法（方法A）であること
 *   ② その窓口が、実際に倉庫のファイル（keiri_tenant_rpc.sql）に定義されていること
 *      ＝手順書と中身が離れていかない
 *   ③ 窓口は外から来る人（anon）には渡っていないこと
 *   ④ 手順書を丸ごと貼っても、仮の店名の行が黙ってできないこと
 */

const MANUAL = readFileSync(
  new URL("../supabase/migrations/keiri_tenant_create_manual.sql", import.meta.url),
  "utf8",
);
const RPC = readFileSync(
  new URL("../supabase/migrations/keiri_tenant_rpc.sql", import.meta.url),
  "utf8",
);

/** 「--」で始まる行を落とした、実際に流れる中身だけを返す */
function liveSql(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

test("手順書がすすめるのは、窓口を1行呼ぶ方法（書き換えるのは店名1か所だけ）", () => {
  assert.match(MANUAL, /方法A（おすすめ/);
  assert.match(MANUAL, /select \* from public\.keiri_tenant_create_manual\('/);

  // おすすめの側が、生の INSERT より先に書かれていること
  const a = MANUAL.indexOf("方法A（おすすめ");
  const b = MANUAL.indexOf("方法B（");
  assert.ok(a > -1 && b > -1, "方法A・方法B の見出しが両方あること");
  assert.ok(a < b, "おすすめの方法が先に来ていること");
});

test("すすめている窓口は、倉庫のファイルに実際に定義されている", () => {
  assert.match(
    RPC,
    /create or replace function public\.keiri_tenant_create_manual\(/,
    "keiri_tenant_rpc.sql に窓口が定義されていること",
  );
  // 返すもの（初回設定のリンクの形）も、手順書の説明と同じであること
  assert.match(RPC, /setup_path := '\/keiri\/welcome\?t=' \|\| v_token;/);
  assert.match(MANUAL, /\/keiri\/welcome\?t=/);
});

test("窓口は、外から来る人（anon）には渡していない", () => {
  // activate と login は渡す（お店が自分で初回設定と入室をするため）
  assert.match(RPC, /grant execute on function public\.keiri_tenant_activate\([^)]*\) to anon/);
  assert.match(RPC, /grant execute on function public\.keiri_tenant_login\(text\) to anon/);

  // create_manual は渡さない
  const grantsToAnon = RPC.split("\n").filter(
    (line) =>
      !line.trimStart().startsWith("--") &&
      /grant\s+execute/i.test(line) &&
      /\banon\b/.test(line),
  );
  for (const line of grantsToAnon) {
    assert.ok(
      !/keiri_tenant_create_manual/.test(line),
      `お店を手で作る窓口を anon に渡さないこと: ${line.trim()}`,
    );
  }
  // 取り上げる1行があること（既定で付いてしまう権利を閉じるため）
  assert.match(RPC, /revoke\s+(all|execute)[\s\S]*?keiri_tenant_create_manual/i);
});

test("手順書を丸ごと貼っても、仮の店名の行が黙ってできない", () => {
  const live = liveSql(MANUAL);
  assert.ok(
    !/insert\s+into\s+public\.keiri_tenants/i.test(live),
    "そのまま流れる INSERT を手順書に置かないこと（人が1行だけ選んで流す形にする）",
  );
  assert.ok(
    !live.includes("ここにお店の名前を入れる"),
    "仮の店名が、そのまま流れる側に残っていないこと",
  );
});
