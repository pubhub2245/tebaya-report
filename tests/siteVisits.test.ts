import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cleanCampaign,
  cleanPath,
  isAllowedOrigin,
  isKnownSite,
  looksLikeBot,
  refHost,
  summarize,
  toVisitRow,
  weekStart,
} from "../lib/siteVisits";

test("知らないサイト名は数えない", () => {
  assert.equal(isKnownSite("playmiyazaki"), true);
  assert.equal(isKnownSite("よそのサイト"), false);
  assert.equal(isKnownSite(undefined), false);
});

test("許した住所からの合図だけ受ける", () => {
  assert.equal(isAllowedOrigin("https://playmiyazaki.com"), true);
  assert.equal(isAllowedOrigin("https://example.com"), false);
  assert.equal(isAllowedOrigin(null), false);
});

test("ページの場所から「?」より後ろを捨てる", () => {
  assert.equal(cleanPath("/ja/surf/kizakihama?utm_campaign=x"), "/ja/surf/kizakihama");
  assert.equal(cleanPath("ja/surf"), "/ja/surf");
  assert.equal(cleanPath(""), "/");
  assert.equal(cleanPath(undefined), "/");
  assert.equal(cleanPath("/a".repeat(300)).length, 200);
});

test("どこから来たかはドメイン名だけにする（自分のサイトは数えない）", () => {
  assert.equal(refHost("https://t.co/abc123?x=1"), "t.co");
  assert.equal(refHost("https://playmiyazaki.com/ja/surf"), null);
  assert.equal(refHost("こわれた文字列"), null);
  assert.equal(refHost(null), null);
});

test("合言葉は80文字まで。無ければ null", () => {
  assert.equal(cleanCampaign("  ig-0918  "), "ig-0918");
  assert.equal(cleanCampaign(""), null);
  assert.equal(cleanCampaign(undefined), null);
});

test("ロボットは人として数えない（名乗らないものも数えない）", () => {
  assert.equal(looksLikeBot("Mozilla/5.0 (compatible; bingbot/2.0)"), true);
  assert.equal(looksLikeBot("curl/8.4.0"), true);
  assert.equal(looksLikeBot(null), true);
  assert.equal(
    looksLikeBot(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    ),
    false,
  );
});

const HUMAN =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

test("1行に整える：IP も UA も入らない", () => {
  const row = toVisitRow({
    site: "playmiyazaki",
    path: "/ja/nature/takachihokyo?utm_campaign=ig-0918",
    campaign: "ig-0918",
    ref: "https://t.co/abc",
    userAgent: HUMAN,
  });
  assert.deepEqual(row, {
    site: "playmiyazaki",
    path: "/ja/nature/takachihokyo",
    campaign: "ig-0918",
    ref_host: "t.co",
  });
  assert.deepEqual(Object.keys(row ?? {}).sort(), [
    "campaign",
    "path",
    "ref_host",
    "site",
  ]);
});

test("1行に整える：知らないサイトとロボットは null", () => {
  assert.equal(
    toVisitRow({ site: "よそ", path: "/", userAgent: HUMAN }),
    null,
  );
  assert.equal(
    toVisitRow({ site: "endo", path: "/", userAgent: "Googlebot/2.1" }),
    null,
  );
});

test("週のはじまりは日本時間の月曜日", () => {
  // 2026-09-18 は金曜 → その週の月曜は 09-14
  assert.equal(weekStart(new Date("2026-09-18T07:34:00Z")), "2026-09-14");
  // 月曜ちょうど（日本時間 0:30 ＝ 前日15:30 UTC）はその日が週のはじまり
  assert.equal(weekStart(new Date("2026-09-13T15:30:00Z")), "2026-09-14");
  // 日曜は前の週の月曜に入る
  assert.equal(weekStart(new Date("2026-09-20T05:00:00Z")), "2026-09-14");
});

test("まとめ：直近7日と、週ごと・サイトごとの数", () => {
  const now = new Date("2026-09-18T09:00:00Z");
  const rows = [
    { site: "playmiyazaki", at: "2026-09-18T08:00:00Z" },
    { site: "playmiyazaki", at: "2026-09-17T08:00:00Z" },
    { site: "keiri", at: "2026-09-16T08:00:00Z" },
    // 7日より前（週の集計には入るが、直近7日には入らない）
    { site: "keiri", at: "2026-09-08T08:00:00Z" },
    { site: "keiri", at: "こわれた日付" },
  ];
  const s = summarize(rows, now);
  assert.deepEqual(s.last7days, { playmiyazaki: 2, keiri: 1 });
  assert.equal(s.weeks[0].weekStart, "2026-09-14");
  assert.deepEqual(s.weeks[0].sites, { playmiyazaki: 2, keiri: 1 });
  assert.equal(s.weeks[1].weekStart, "2026-09-07");
  assert.deepEqual(s.weeks[1].sites, { keiri: 1 });
});
