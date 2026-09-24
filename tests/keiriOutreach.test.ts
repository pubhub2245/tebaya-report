/**
 * ホームの「今日1軒だけ送る」の帯（kp145）の決めごとを固定する。
 *
 * ここが崩れると、
 *   ・他人の連絡先（LINEのID・メールアドレス）が端末の画面に出る
 *   ・受け取る8軒（同じ出店先の同業）に値段が先に見える
 *   ・手羽屋のスタッフの画面に帯が出る
 * のどれかが起きる。どれも取り返しがつかないので、戻り止めを置く。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  OUTREACH_LINK,
  OUTREACH_MESSAGE,
  OUTREACH_SHOPS,
  parseSent,
  remainingShops,
  serializeSent,
  shouldShowNudge,
  todayKey,
} from "../lib/keiri/outreach";

const lib = fs.readFileSync(
  path.join(process.cwd(), "lib", "keiri", "outreach.ts"),
  "utf8",
);
const view = fs.readFileSync(
  path.join(process.cwd(), "app", "components", "OwnerOutreachNudge.tsx"),
  "utf8",
);
const home = fs.readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf8");

test("送り先は8軒で、画面に出るのはお店の種類だけ（連絡先は1つも出さない）", () => {
  assert.equal(OUTREACH_SHOPS.length, 8);
  const shown = OUTREACH_SHOPS.map((s) => `${s.label} ${s.note ?? ""}`).join(" ");
  // メールアドレスらしきもの・LINEのIDらしきもの（英字のドット区切り）が無いこと
  assert.ok(!/@/.test(shown), "画面に出す文字にメールアドレスが入っている");
  assert.ok(!/[a-zA-Z0-9]+\.[a-zA-Z0-9]+/.test(shown), "画面に出す文字に連絡先らしきIDが入っている");
  // ファイル全体でも、司令室にある実際の宛先を写し取っていないこと
  for (const handle of [
    "smile.crepe",
    "kaitenyaki.831",
    "torinchyu",
    "bistrotmontporte",
    "foodtruck.ginya",
    "nittaco",
    "out-rip",
    "gurapuro",
  ]) {
    assert.ok(!lib.includes(handle), `連絡先 ${handle} がファイルに入っている`);
    assert.ok(!view.includes(handle), `連絡先 ${handle} が画面のファイルに入っている`);
  }
});

test("送る文に値段は入れない（受け取る8軒は同じ出店先の同業のため）", () => {
  assert.ok(!/15,?000/.test(OUTREACH_MESSAGE));
  assert.ok(!/円/.test(OUTREACH_MESSAGE));
  assert.ok(!/[0-9]{3,}/.test(OUTREACH_MESSAGE.replace(OUTREACH_LINK, "")));
});

test("送る文は司令室の4行と同じで、リンクは案内ページ1本だけ", () => {
  const lines = OUTREACH_MESSAGE.split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith("◯◯さん、手羽屋の川畑です。"));
  assert.equal(lines[3], OUTREACH_LINK);
  assert.ok(OUTREACH_LINK.endsWith("/keiri/case"));
  assert.equal(OUTREACH_MESSAGE.match(/https?:\/\//g)?.length, 1);
});

test("帯が出るのは『じゅんの端末』だけ。印が無ければ絶対に出ない", () => {
  const base = { sent: [], snoozedOn: null, today: "2026-09-25" };
  assert.equal(shouldShowNudge({ ...base, ownerDevice: false }), false);
  assert.equal(shouldShowNudge({ ...base, ownerDevice: true }), true);
});

test("今日は出さない／8軒ぜんぶ送った、のときは出ない", () => {
  const all = OUTREACH_SHOPS.map((s) => s.id);
  assert.equal(
    shouldShowNudge({ ownerDevice: true, sent: [], snoozedOn: "2026-09-25", today: "2026-09-25" }),
    false,
  );
  // 日が変われば、また出る
  assert.equal(
    shouldShowNudge({ ownerDevice: true, sent: [], snoozedOn: "2026-09-24", today: "2026-09-25" }),
    true,
  );
  assert.equal(
    shouldShowNudge({ ownerDevice: true, sent: all, snoozedOn: null, today: "2026-09-25" }),
    false,
  );
  // 1軒でも残っていれば出る
  assert.equal(
    shouldShowNudge({ ownerDevice: true, sent: all.slice(1), snoozedOn: null, today: "2026-09-25" }),
    true,
  );
});

test("送った印の読み書き：知らない名前は捨て、並び順は送り先の順にそろう", () => {
  assert.deepEqual(parseSent("crepe,tori,よその店,crepe"), ["crepe", "tori"]);
  assert.deepEqual(parseSent(null), []);
  assert.equal(serializeSent(["tori", "crepe"]), "crepe,tori");
  assert.equal(remainingShops(["crepe"]).length, 7);
});

test("今日の日付は日本時間で決まる（夜中に日付が変わってすぐ帯が戻らない）", () => {
  // 世界標準時 2026-09-24 15:30 は 日本時間で 9/25 00:30
  assert.equal(todayKey(new Date("2026-09-24T15:30:00Z")), "2026-09-25");
  assert.equal(todayKey(new Date("2026-09-24T14:30:00Z")), "2026-09-24");
});

test("帯はホームのいちばん上（月間売上まとめより前）に置く", () => {
  const nudge = home.indexOf("<OwnerOutreachNudge />");
  const summary = home.indexOf("<MonthlySummary />");
  assert.ok(nudge > 0, "ホームに帯が置かれていない");
  assert.ok(nudge < summary, "帯が月間売上まとめより下にある");
});

test("印を付けるのは手羽屋の合言葉が合ったときだけ（お店の合言葉では付けない）", () => {
  const gate = fs.readFileSync(
    path.join(process.cwd(), "app", "components", "AdminGate.tsx"),
    "utf8",
  );
  assert.ok(gate.includes("markOwnerDevice()"));
  // ①手羽屋の枝（checkAdminPassword）より後、②お店の枝（/api/keiri/login）より前にあること
  const tebaya = gate.indexOf("if (checkAdminPassword(pw))");
  const mark = gate.indexOf("markOwnerDevice()");
  const shop = gate.indexOf('"/api/keiri/login"');
  assert.ok(tebaya < mark && mark < shop, "印を付ける場所が手羽屋の枝の中にない");
  assert.equal(gate.match(/markOwnerDevice\(\)/g)?.length, 1);
});

test("帯は日報のデータを読み書きしない（倉庫にも外にもつながない）", () => {
  for (const word of ["supabase", "fetch(", "daily_reports"]) {
    assert.ok(!view.includes(word), `帯が ${word} を使っている`);
    assert.ok(!lib.includes(word), `帯の中身が ${word} を使っている`);
  }
});

test("読み込み中は何も出さない（スタッフの画面に一瞬でも出さない）", () => {
  assert.ok(view.includes("if (checking) return null;"));
});
