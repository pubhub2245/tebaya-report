/**
 * 「外から確かめる窓口」の一覧と robots.txt の取り合わせのテスト。
 *
 * ここが狂うと、検査役（B2）が窓口を開けないまま
 * 「外から確かめられます」と言ってしまう（2026-10-06 に実際に起きた）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CHECK_WINDOWS,
  CHECK_WINDOW_HEADERS,
  CHECK_WINDOW_PATHS,
  stampCheckWindow,
} from "../lib/keiri/checkWindow";

test("窓口は読むだけの住所で、重なりが無い", () => {
  assert.ok(CHECK_WINDOWS.length >= 4);
  for (const w of CHECK_WINDOWS) {
    assert.ok(w.path.startsWith("/api/"), `窓口は /api/ の下だけ: ${w.path}`);
    assert.ok(w.what.length > 0);
    assert.ok(w.check.length > 0);
  }
  assert.equal(new Set(CHECK_WINDOW_PATHS).size, CHECK_WINDOW_PATHS.length);
});

test("窓口は検索結果に載せず、保存もさせない", () => {
  assert.match(CHECK_WINDOW_HEADERS["X-Robots-Tag"], /noindex/);
  assert.match(CHECK_WINDOW_HEADERS["Cache-Control"], /no-store/);
});

test("f3-3 と f3-4 を確かめる窓口が一覧に入っている", () => {
  assert.ok(CHECK_WINDOW_PATHS.includes("/api/keiri/firstmonth"));
  assert.ok(CHECK_WINDOW_PATHS.includes("/api/keiri/scopecheck"));
  assert.ok(CHECK_WINDOW_PATHS.includes("/api/version"));
});

test("読む窓口が名乗りだけで入れないかを確かめる窓口も、一覧に入っている（kp239・f3-4）", () => {
  assert.ok(CHECK_WINDOW_PATHS.includes("/api/keiri/readcheck"));
  const w = CHECK_WINDOWS.find((x) => x.path === "/api/keiri/readcheck");
  assert.ok(w);
  assert.ok(w!.check.includes("f3-4"));
});

test("確かめる窓口は、どれも読むだけ（棚に書き込む道をコードに持たない）", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  for (const w of CHECK_WINDOWS) {
    const file = join(__dirname, "..", "app", ...w.path.split("/").filter(Boolean), "route.ts");
    let src = "";
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue; // 住所と置き場所が違う窓口はここでは見ない
    }
    for (const bad of [".insert(", ".upsert(", ".delete("]) {
      assert.ok(!src.includes(bad), `読むだけの窓口に書き込みが入っている：${w.path} ${bad}`);
    }
  }
});

/**
 * 「いつ・どの版で答えたか」の札（kp246・2026-10-09）。
 *
 * 検査役が「いま見ているのが新しい答えか」をその場で見分けられないと、
 * 本番が正しくても合否が付けられず足止めになる（10/9 に2回 起きた）。
 */
test("窓口の返事には、答えた時刻と版の合言葉が必ず入る", () => {
  const at = new Date("2026-10-09T09:34:00.000Z");
  const body = stampCheckWindow({ ok: true, count: 3 }, at);
  assert.equal(body.ok, true);
  assert.equal(body.count, 3);
  assert.equal(body.answeredAt, "2026-10-09T09:34:00.000Z");
  assert.equal(typeof body.build, "string");
  assert.ok(body.build.length > 0);
  assert.match(body.freshness, /answeredAt/);
});

test("札は元の中身を1つも消さない・上書きしない", () => {
  const body = stampCheckWindow({ sheetReady: true, problems: [] as string[] });
  assert.equal(body.sheetReady, true);
  assert.deepEqual(body.problems, []);
});

test("外から確かめる窓口は、すべて札を付けて返す（付け忘れが無い）", () => {
  const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  for (const w of CHECK_WINDOWS) {
    const dir = join(__dirname, "..", "app", ...w.path.split("/").filter(Boolean));
    const files = [join(dir, "route.ts"), join(dir, "describe.ts")].filter((f) => existsSync(f));
    assert.ok(files.length > 0, `窓口のコードが見つからない：${w.path}`);
    const src = files.map((f) => readFileSync(f, "utf8")).join("\n");
    assert.ok(
      src.includes("stampCheckWindow("),
      `窓口に「いつ・どの版で答えたか」の札が付いていない：${w.path}`,
    );
  }
});

/**
 * 「札を付けて返す窓口なのに、一覧に入っていない」を自動で見つける（2026-10-10・B）。
 *
 * ■ なぜ要るか
 *   同じ取りこぼしが 2回 起きています。
 *   ・10/06 … robots.txt が窓口をことわっていて、検査役が1つも開けなかった
 *   ・10/10 … 新しい窓口（/api/keiri/setuptodo）を一覧に足し忘れ、
 *             本番は正しいのに検査役だけが開けなかった
 *   どちらも「窓口を作ったのに、読んでよい住所の一覧に入っていない」が原因です。
 *   一覧（CHECK_WINDOWS）から robots.txt が作られるので、
 *   **足し忘れると、外から確かめられないまま「確かめられます」と言ってしまいます。**
 *
 * ■ 何を見ているか
 *   窓口の返事に札を付ける合図（stampCheckWindow）を使っているコードを全部ひろい、
 *   その住所（または1つ上の住所）が一覧に入っているかを見ます。
 *   ＝ 次に新しい窓口を作ったとき、一覧に足すまでテストが通りません。
 */
test("札を付けて返す窓口は、ぜんぶ一覧に入っている（足し忘れが起きない）", () => {
  const { readdirSync, readFileSync, statSync } = require("node:fs") as typeof import("node:fs");
  const { join, relative, sep } = require("node:path") as typeof import("node:path");

  const apiRoot = join(__dirname, "..", "app", "api");
  const stamped: string[] = [];

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      if (!readFileSync(full, "utf8").includes("stampCheckWindow(")) continue;
      // 住所は「ファイルの置き場所」から作る（/app/api/keiri/shelves/route.ts → /api/keiri/shelves）
      const rel = relative(join(__dirname, "..", "app"), dir).split(sep).join("/");
      stamped.push(`/${rel}`);
    }
  };
  walk(apiRoot);

  assert.ok(stamped.length > 0, "札を付ける窓口が1つも見つからない（探し方が壊れている）");

  for (const path of stamped) {
    const parent = path.split("/").slice(0, -1).join("/");
    assert.ok(
      CHECK_WINDOW_PATHS.includes(path) || CHECK_WINDOW_PATHS.includes(parent),
      `窓口が一覧（CHECK_WINDOWS）に入っていないので、外から開けません：${path}`,
    );
  }
});

test("のこりの手続きを数える窓口も、一覧に入っている（kp247）", () => {
  assert.ok(CHECK_WINDOW_PATHS.includes("/api/keiri/setuptodo"));
});
