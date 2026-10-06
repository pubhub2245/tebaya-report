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
