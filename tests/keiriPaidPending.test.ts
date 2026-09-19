/**
 * 支払いのリンクで先に払われた方を、行き止まりにしないことを固定する（kp95）。
 *
 * ここが狂うと、**お金を払った人が「このリンクは使えません」で終わる**。
 * 申し込みを取りこぼす一番きつい形なので、ゆるくしない。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KEIRI_PAID_PENDING_MESSAGE,
  KEIRI_PAID_PENDING_SOURCE,
  KEIRI_PAID_PENDING_UNKNOWN,
  isPaidPendingArrival,
  paidPendingApplicationRow,
  paidPendingMailto,
  paidPendingNotificationText,
} from "../lib/keiri/paidPending";
import { KEIRI_APPLY_COPY_TO } from "../lib/keiri/apply";
import { KEIRI_COMPANY } from "../lib/keiri/legal";

const SESSION = "cs_live_a1B2c3D4e5F6g7H8";

test("この道に入るのは『?session= だけ』のときに限る（?t= は今までどおり）", () => {
  assert.equal(isPaidPendingArrival({ session: SESSION }), true);
  assert.equal(isPaidPendingArrival({ token: "", session: SESSION }), true);
  // こちらが手で発行したリンクは、見つからなければリンク違い。文面を変えない
  assert.equal(isPaidPendingArrival({ token: "abc", session: SESSION }), false);
  assert.equal(isPaidPendingArrival({ token: "abc" }), false);
  assert.equal(isPaidPendingArrival({}), false);
  assert.equal(isPaidPendingArrival({ session: "   " }), false);
});

test("画面に出す文面は、待たせない言い方にしてある", () => {
  assert.match(KEIRI_PAID_PENDING_MESSAGE, /確認/);
  assert.match(KEIRI_PAID_PENDING_MESSAGE, /ご連絡/);
  // 「使えません」で終わらせない（これが kp95 の目的そのもの）
  assert.doesNotMatch(KEIRI_PAID_PENDING_MESSAGE, /使えません/);
});

test("控えの1行：印は paid_pending・折り返し前・どのお店にも繋がっていない", () => {
  const row = paidPendingApplicationRow({ session: SESSION, shopName: " デモ食堂 " });
  assert.equal(row.source, KEIRI_PAID_PENDING_SOURCE);
  assert.equal(row.status, "new");
  assert.equal(row.shop_name, "デモ食堂");
  assert.equal(row.phone, null);
  // ★お店の行に繋げない（棚の決まりがそれを求めている）
  assert.equal("tenant_id" in row, false);
  // 支払い画面の番号が控えに残る＝あとから誰が払ったかを引ける
  assert.match(row.note, new RegExp(SESSION));
});

test("控えに作り物の連絡先を入れない", () => {
  const row = paidPendingApplicationRow({ session: SESSION });
  assert.equal(row.contact_name, KEIRI_PAID_PENDING_UNKNOWN);
  assert.equal(row.email, KEIRI_PAID_PENDING_UNKNOWN);
  // 名前が無いときも空にしない（棚の決まりが1文字以上を求めている）
  assert.equal(row.shop_name, KEIRI_PAID_PENDING_UNKNOWN);
  assert.ok(row.shop_name.length >= 1 && row.shop_name.length <= 120);
  assert.ok(row.contact_name.length >= 1 && row.contact_name.length <= 120);
  assert.ok(row.email.length >= 1 && row.email.length <= 254);
  assert.ok(row.note.length >= 1 && row.note.length <= 2000);
});

test("長い貼り付けと改行は、そのまま控えに入れない", () => {
  const row = paidPendingApplicationRow({
    session: `cs_${"x".repeat(500)}`,
    shopName: `あ\nい\tう${"ん".repeat(300)}`,
  });
  assert.ok(row.shop_name.length <= 120);
  assert.doesNotMatch(row.shop_name, /[\r\n\t]/);
  assert.ok(row.note.length <= 2000);
  // 番号の行そのものに、改行やタブが混ざって入っていない
  const line = row.note.split("\n").find((v) => v.startsWith("お支払い画面の番号：")) ?? "";
  assert.ok(line.length > "お支払い画面の番号：".length);
  assert.doesNotMatch(line, /[\r\t]/);
  assert.ok(line.length <= "お支払い画面の番号：".length + 200);
});

test("LINE の知らせに、折り返すのに要ることが全部入っている", () => {
  const text = paidPendingNotificationText({
    session: SESSION,
    shopName: "デモ食堂",
    at: new Date("2026-09-19T08:34:00Z"),
  });
  assert.match(text, /お支払いが先に済んだ/);
  assert.match(text, new RegExp(SESSION));
  assert.match(text, /デモ食堂/);
  // 日本時間で出す（8:34 UTC ＝ 17:34 JST）
  assert.match(text, /17:34/);
  // 「初回設定はまだ終わっていない」と正直に書く
  assert.match(text, /終わっていません/);
  assert.match(text, /折り返して/);
});

test("知らせも控えも通らなかったときの下書きは、2か所に届く", () => {
  const mail = paidPendingMailto({ to: KEIRI_COMPANY.email, session: SESSION, shopName: "デモ食堂" });
  assert.equal(mail.to, KEIRI_COMPANY.email);
  assert.equal(mail.cc, KEIRI_APPLY_COPY_TO);
  assert.equal(mail.recipients.length, 2);
  assert.ok(mail.url.startsWith(`mailto:${KEIRI_COMPANY.email}?`));
  assert.match(mail.url, new RegExp(encodeURIComponent(SESSION)));
  assert.match(mail.body, new RegExp(SESSION));
  assert.match(mail.subject, /デモ食堂/);
});

// ------------------------------------------------------------------
// 見張り：この道を外したら落ちるようにしておく
// ------------------------------------------------------------------

test("初回設定の受け口は、?session= のときだけ『お預かり』に落とす", () => {
  const src = readFileSync(new URL("../app/api/keiri/welcome/route.ts", import.meta.url), "utf8");
  // 見つからなかったときの2か所（窓口ごし・棚を直接）の両方で見ている
  assert.equal(src.split("isPaidPendingArrival({ token, session })").length - 1, 2);
  // 知らせと控えの両方をやる
  assert.match(src, /sendLineGroupMessage/);
  assert.match(src, /keiri_applications/);
  // ?t= のときの文面は残っている
  assert.match(src, /このリンクは使えません/);
});

test("初回設定の画面は、赤い『使えません』より先に『お預かり』を見る", () => {
  const src = readFileSync(new URL("../app/keiri/welcome/page.tsx", import.meta.url), "utf8");
  const pendingAt = src.indexOf("json?.pending");
  const errorAt = src.indexOf("!res.ok || !json?.ok");
  assert.ok(pendingAt > 0, "お預かりの見分けが画面から消えている");
  assert.ok(errorAt > 0);
  assert.ok(pendingAt < errorAt, "順番が逆だと赤い警告が出てしまう");
});

test("手羽屋の毎日の画面には、この直しが1行も入っていない", () => {
  // 触ったのは経理パッケージの初回設定だけ。日報・シフト・レジ・お金の計算は無関係
  for (const f of [
    "../lib/money.ts",
    "../app/report/page.tsx",
    "../app/shifts/page.tsx",
    "../app/cash/register/page.tsx",
  ]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /paidPending/i, `${f} に経理パッケージの直しが入っている`);
  }
});
