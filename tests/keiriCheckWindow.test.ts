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
  CLOSED_ON_PURPOSE,
  CLOSED_ON_PURPOSE_PATHS,
  stampCheckWindow,
  VERDICT_VALID_MINUTES,
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

test("ためこまれた古い答えは、そのまま合否に使えない形になっている（kp246・f1-4）", () => {
  const at = new Date("2026-11-09T09:00:00.000Z");
  const body = stampCheckWindow({ ok: true }, at);
  // 答えそのものに「いつまでなら合否に使ってよいか」が入っている
  assert.equal(body.verdictValidUntil, "2026-11-09T09:10:00.000Z");
  assert.match(body.verdictRule, /verdictValidUntil/);
  assert.match(body.verdictRule, /合否を付けないでください/);
  // 期限は答えを作った時刻より後
  assert.ok(new Date(body.verdictValidUntil) > new Date(body.answeredAt));
  assert.equal(VERDICT_VALID_MINUTES, 10);
});

test("窓口の札は、途中の配り先にもためさせない言い方になっている（kp246）", () => {
  assert.match(CHECK_WINDOW_HEADERS["CDN-Cache-Control"], /no-store/);
  assert.match(CHECK_WINDOW_HEADERS["Vercel-CDN-Cache-Control"], /no-store/);
  assert.equal(CHECK_WINDOW_HEADERS["Pragma"], "no-cache");
});

/**
 * お申し込みの数を答える窓口も、一覧に入っている（2026-11-09 18:34 B・f2-1・f2-3）。
 *
 * ■ なぜ要るか
 *   11/9 18:0x に A が実測して、お申し込みの数の窓口（applications/count）だけ
 *   **外から1文字も読めない**ことが分かりました
 *   （robots.txt で「読まないでください」の側だったため）。
 *   ＝ ②（申し込みが確実に残る）の合否を外から確かめる道が、1本だけ閉じていました。
 *   ここが落ちるようにしておけば、同じ取りこぼしが戻ってきません。
 */
test("お申し込みの数の窓口も、外から読んでよい一覧に入っている（f2-1・f2-3）", () => {
  assert.ok(
    CHECK_WINDOW_PATHS.includes("/api/keiri/applications/count"),
    "お申し込みの数の窓口が一覧に無いので、外から読めません",
  );
  const w = CHECK_WINDOWS.find((x) => x.path === "/api/keiri/applications/count");
  assert.ok(w);
  assert.ok(w!.check.includes("f2-1"));
});

/**
 * 窓口の決まり②（お店の名前・連絡先・鍵の値を1文字も返さない）を、コードで見張る。
 * 件数を答える窓口に、うっかり名前や連絡先を足すと、ここで落ちる。
 */
test("お申し込みの数の窓口は、件数だけを返す（名前・連絡先・金額を返さない）", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const src = readFileSync(
    join(__dirname, "..", "app", "api", "keiri", "applications", "count", "route.ts"),
    "utf8",
  );
  // 返している中身は件数と時刻だけ（返事を組み立てている所に名前・連絡先の欄が無い）
  for (const bad of ["shopName", "shop_name", "email", "phone", "contact", "amount", "sales"]) {
    assert.ok(!src.includes(bad), `件数だけの窓口に ${bad} が入っている`);
  }
  // 書き込みの道を持たない
  for (const bad of [".insert(", ".upsert(", ".delete("]) {
    assert.ok(!src.includes(bad), `読むだけの窓口に書き込みが入っている：${bad}`);
  }
});

/**
 * 窓口の案内所（2026-11-09 18:34 B・共通）。
 *
 * 「窓口はあるのに、外から確かめる人がそれを知らない／開けない」が
 * 10/06・10/10・11/09 の3回 起きた。案内所そのものが一覧から落ちると、
 * また人づてに聞くしかなくなるので、ここで止める。
 */
test("窓口の案内所が、いちばん先頭にあって自分も一覧に入っている（共通）", () => {
  assert.equal(
    CHECK_WINDOW_PATHS[0],
    "/api/keiri/windows",
    "案内所は一覧のいちばん先頭に置く（検査役が最初に見つけられるように）",
  );
  const w = CHECK_WINDOWS.find((x) => x.path === "/api/keiri/windows");
  assert.ok(w);
});

test("案内所は、どの項目をどの窓口で測れるかを引けるだけの中身を持っている", () => {
  // 項目ごとのまとめ（byCheck）は「・」区切りの check から作るので、
  // どの窓口も「・」で区切った項目名を持っていること
  for (const w of CHECK_WINDOWS) {
    const ids = w.check.split("・").map((s) => s.trim()).filter(Boolean);
    assert.ok(ids.length > 0, `窓口に項目名が無い：${w.path}`);
  }
  // 仕上げチェック表の「未・不合格」が付いている項目は、必ず測る窓口がある
  const all = CHECK_WINDOWS.flatMap((w) =>
    w.check.split("・").map((s) => s.trim()),
  );
  for (const id of ["f1-4", "f3-4", "f5-4", "f2-1"]) {
    assert.ok(all.includes(id), `${id} を測る窓口が1本も無い`);
  }
});

/**
 * 受け皿ぜんぶの点検（/api/keiri/diagnose）も、外から読んでよい一覧に入っている
 * （2026-11-10 B・f2-1・f2-2・f2-3）。
 *
 * ■ なぜ要るか
 *   11/10 18:0x に A が実測して、この住所が **外から1文字も読めない**ことが分かりました
 *   （robots.txt で「読まないでください」の側だったため）。
 *   ＝ ②（申し込みが確実に残る）の合否を外から1回で確かめる道が閉じていました。
 *   11/9 の applications/count とまったく同じ取りこぼしなので、ここで止めます。
 */
test("受け皿ぜんぶの点検も、外から読んでよい一覧に入っている（f2-1・f2-2・f2-3）", () => {
  assert.ok(
    CHECK_WINDOW_PATHS.includes("/api/keiri/diagnose"),
    "受け皿の点検が一覧に無いので、外から読めません",
  );
  const w = CHECK_WINDOWS.find((x) => x.path === "/api/keiri/diagnose");
  assert.ok(w);
  for (const id of ["f2-1", "f2-2", "f2-3"]) {
    assert.ok(w!.check.includes(id), `受け皿の点検に ${id} が結び付いていない`);
  }
});

test("受け皿ぜんぶの点検は、鍵の値も本物の金額も返さない（決まり②③）", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const src = readFileSync(
    join(__dirname, "..", "app", "api", "keiri", "diagnose", "route.ts"),
    "utf8",
  );
  // 鍵・合言葉の値をそのまま返す道を持たない（設定済み／未設定だけを返す）
  for (const bad of [
    "process.env.SUPABASE_SERVICE_ROLE_KEY,",
    "process.env.NEXT_PUBLIC_ADMIN_PASSWORD,",
  ]) {
    assert.ok(!src.includes(bad), `点検の窓口に鍵の値が入っている：${bad}`);
  }
  // 札を付けて返している（いつ・どの版で答えたか）
  assert.ok(src.includes("stampCheckWindow("));
  assert.ok(src.includes("CHECK_WINDOW_HEADERS"));
});

/**
 * 受け皿の点検は倉庫に12回 聞く。順番に待つと、外から読む道具の待ち時間（10秒）を
 * 超えて切れる（同じことが 11/10 お昼に 金庫・読み方くらべの2本で起きた）。
 * おたがいの答えを必要としないものは、同時に頼んでいること。
 */
test("受け皿の点検は、順番待ちをせず同時に頼んでいる（待ち時間で切れない）", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const src = readFileSync(
    join(__dirname, "..", "app", "api", "keiri", "diagnose", "route.ts"),
    "utf8",
  );
  assert.ok(
    src.includes("await Promise.all([\n    checkApplications(applications),"),
    "控え・件数・訪問の3つを同時に頼んでいない（順番待ちに戻っている）",
  );
});

/**
 * 「わざと外から読めないままにしている住所」の一覧（2026-11-10・B）。
 *
 * ■ なぜ要るか
 *   11/10 18:0x に A が「/api/keiri/month が外から1文字も読めない」を
 *   行き止まりとして残しました。あの住所は合言葉が要り、**本物の金額をそのまま返す**ので、
 *   外から読んでよい窓口の決まり③に当たり、一覧に入れてはいけません。
 *   「入れてはいけない」と書いた場所がどこにも無かったため、同じ行き止まりが何度でも立ちます。
 */
test("わざと閉じている住所は、窓口の一覧とぶつからない", () => {
  assert.ok(CLOSED_ON_PURPOSE.length > 0);
  for (const c of CLOSED_ON_PURPOSE) {
    assert.ok(
      !CHECK_WINDOW_PATHS.includes(c.path),
      `閉じている住所が窓口の一覧にも入っている：${c.path}`,
    );
    assert.ok(c.why.length > 0, `なぜ閉じているかが書かれていない：${c.path}`);
    assert.ok(c.insteadOpen.length > 0, `代わりに開く窓口が無い：${c.path}`);
    // 代わりに開く先は、必ず本物の窓口であること（存在しない住所を案内しない）
    for (const alt of c.insteadOpen) {
      assert.ok(
        CHECK_WINDOW_PATHS.includes(alt),
        `代わりに案内している住所が窓口の一覧に無い：${alt}`,
      );
    }
  }
  assert.ok(CLOSED_ON_PURPOSE_PATHS.includes("/api/keiri/month"));
});

test("案内所は、わざと閉じている住所も外に出す（同じ行き止まりが立たない）", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const src = readFileSync(
    join(__dirname, "..", "app", "api", "keiri", "windows", "route.ts"),
    "utf8",
  );
  assert.ok(src.includes("closedOnPurpose"));
  assert.ok(src.includes("insteadOpen"));
});
