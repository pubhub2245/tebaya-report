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
  summarizeDaily,
  jstDay,
} from "../lib/siteVisits";
import { BUILD_STAMP, parseBuildStamp } from "../lib/buildStamp";

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

// ============================================================
// 2026-09-19 追加：倉庫側で数えた「日ごとの数」からまとめる道
// ============================================================
// 訪問の棚は「入れることだけ許す郵便ポスト」なので、1行ずつ読めない。
// そのときは倉庫側の集計（site_visits_summary）から日ごとの数を受け取る。
test("summarizeDaily: 日ごとの数を、週ごと・サイトごとに足し合わせる", () => {
  // 2026-09-19（土）の昼を「いま」とする
  const now = new Date("2026-09-19T03:00:00.000Z"); // = 9/19 12:00 JST
  const out = summarizeDaily(
    [
      { site: "keiri", day: "2026-09-19", hits: 3 },
      { site: "keiri", day: "2026-09-18", hits: 2 },
      { site: "playmiyazaki", day: "2026-09-18", hits: 5 },
      // 週をまたぐ（9/14 は月曜＝その週のはじまり）
      { site: "keiri", day: "2026-09-14", hits: 1 },
      // 7日より前（直近7日には入らないが、週の集計には入る）
      { site: "keiri", day: "2026-09-10", hits: 9 },
    ],
    now,
  );

  // 直近7日＝今日を含む7日ぶん（9/13〜9/19）。9/10 の9件は入らない
  assert.equal(out.last7days.keiri, 3 + 2 + 1);
  assert.equal(out.last7days.playmiyazaki, 5);

  // 週は新しい順。9/14〜9/20 の週が先
  assert.equal(out.weeks[0].weekStart, "2026-09-14");
  assert.equal(out.weeks[0].sites.keiri, 3 + 2 + 1);
  assert.equal(out.weeks[0].sites.playmiyazaki, 5);
  assert.equal(out.weeks[1].weekStart, "2026-09-07");
  assert.equal(out.weeks[1].sites.keiri, 9);
});

test("summarizeDaily: 壊れた行は数に入れない（勝手に0や NaN を作らない）", () => {
  const now = new Date("2026-09-19T03:00:00.000Z");
  const out = summarizeDaily(
    [
      { site: "keiri", day: "2026-09-19", hits: 2 },
      { site: "", day: "2026-09-19", hits: 5 }, // サイト名が空
      { site: "keiri", day: "こわれた", hits: 5 }, // 日付でない
      { site: "keiri", day: "2026-09-19", hits: Number.NaN }, // 数でない
      { site: "keiri", day: "2026-09-19", hits: 0 }, // 0件
    ] as { site: string; day: string; hits: number }[],
    now,
  );
  assert.equal(out.last7days.keiri, 2);
  assert.equal(Object.keys(out.last7days).length, 1);
  assert.equal(out.weeks.length, 1);
});

test("summarizeDaily: 何も無ければ空（『数えられていない』を0件と書き換えない）", () => {
  const out = summarizeDaily([], new Date("2026-09-19T03:00:00.000Z"));
  assert.deepEqual(out.last7days, {});
  assert.deepEqual(out.weeks, []);
});

test("jstDay: 日本時間の日付に直す（日付の境目をまたぐ）", () => {
  // 9/18 15:00 UTC = 9/19 00:00 JST
  assert.equal(jstDay(new Date("2026-09-18T15:00:00.000Z")), "2026-09-19");
  // 9/18 14:59 UTC = 9/18 23:59 JST
  assert.equal(jstDay(new Date("2026-09-18T14:59:00.000Z")), "2026-09-18");
});

// ============================================================
// 2026-09-19 追加：版の合言葉（出したのに古く見える、を終わらせる）
// ============================================================
test("parseBuildStamp: コミットの番号と組み立て時刻に分かれる", () => {
  const p = parseBuildStamp("a34e8b1@2026-09-19T05:42:31.000Z");
  assert.equal(p.commit, "a34e8b1");
  assert.equal(p.builtAt, "2026-09-19T05:42:31.000Z");
});

test("parseBuildStamp: 時刻が無くても壊れない", () => {
  const p = parseBuildStamp("local");
  assert.equal(p.commit, "local");
  assert.equal(p.builtAt, null);
});

test("BUILD_STAMP: 秘密の値が混ざっていない（英数字と記号だけ・短い）", () => {
  assert.ok(BUILD_STAMP.length <= 80, "合言葉が長すぎます");
  assert.ok(
    /^[A-Za-z0-9@:.\-_]*$/.test(BUILD_STAMP),
    "合言葉に思わぬ文字が入っています",
  );
});
