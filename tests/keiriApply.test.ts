/**
 * 経理パッケージの「お申し込み」の受け取りを固定する。
 *
 * ここが狂うと、申し込みが黙って消えるか、誰にも届かない知らせが出る。
 * 最初の1件を取るための入り口なので、ゆるくしない。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KEIRI_APPLY_COPY_TO,
  KEIRI_APPLY_LIMITS,
  keiriApplyMailto,
  keiriApplyNotificationText,
  keiriApplyRecipients,
  normalizeKeiriApplication,
} from "../lib/keiri/apply";
import { KEIRI_COMPANY, tokushohoRows } from "../lib/keiri/legal";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

function ok(input: Parameters<typeof normalizeKeiriApplication>[0]) {
  const r = normalizeKeiriApplication(input);
  assert.equal(r.ok, true, `通るはずが弾かれた: ${JSON.stringify(r)}`);
  assert.equal("spam" in r && r.spam, false);
  return (r as { ok: true; spam: false; value: ReturnType<typeof Object> }).value as {
    shop_name: string;
    contact_name: string;
    email: string;
    phone: string;
    note: string | null;
  };
}

test("ふつうの申し込みは通る。前後の空白は落とす", () => {
  const v = ok({
    shopName: "  屋台 手羽屋  ",
    contactName: "川畑 潤一郎",
    email: " you@example.com ",
    phone: "090-0000-0000",
    note: "月末の締めが大変です",
  });
  assert.equal(v.shop_name, "屋台 手羽屋");
  assert.equal(v.email, "you@example.com");
  assert.equal(v.phone, "090-0000-0000");
  assert.equal(v.note, "月末の締めが大変です");
});

test("ひとことは空なら null（空の文字を控えに残さない）", () => {
  const v = ok({ shopName: "A店", phone: "090-1111-2222" });
  assert.equal(v.note, null);
});

// ------------------------------------------------------------
// 必ず入れていただくのは2つだけ（2026-10-01・kp207）
// ------------------------------------------------------------
/**
 * ★10/7 の出店説明会は立ち話で、相手のスマホに打ってもらう。
 *   4つ打たせると途中でやめられるので、お店の名前と電話番号の2つに絞った。
 *   お名前とメールアドレスは空でも申し込みが通る（折り返しは電話でする）。
 */
test("お店の名前と電話番号の2つだけで申し込める（お名前・メールは空でよい）", () => {
  const v = ok({ shopName: "屋台 ほげ", phone: "0986-00-0000" });
  assert.equal(v.shop_name, "屋台 ほげ");
  assert.equal(v.phone, "0986-00-0000");
  // ★空の文字のまま残す（倉庫の列が not null なので null にしてはいけない）
  assert.equal(v.contact_name, "");
  assert.equal(v.email, "");
});

test("電話番号が空なら断る（折り返す道が無くなるため）", () => {
  const r = normalizeKeiriApplication({ shopName: "A店", email: "a@b.jp" });
  assert.equal(r.ok, false);
  assert.ok(
    (r as { ok: false; errors: string[] }).errors.some((m) => m.includes("電話番号")),
  );
});

test("電話番号は、数字が足りないものだけ断る（ハイフンあり・なし・+81 は通す）", () => {
  for (const good of ["09000000000", "090-0000-0000", "+81 90 0000 0000", "0986-00-0000"]) {
    ok({ shopName: "A店", phone: good });
  }
  for (const bad of ["090", "あいうえお", "12345678"]) {
    const r = normalizeKeiriApplication({ shopName: "A店", phone: bad });
    assert.equal(r.ok, false, `通してはいけない: ${bad}`);
  }
});

test("メールアドレスは任意だが、入れたときは形を見る", () => {
  ok({ shopName: "A店", phone: "090-0000-0000", email: "" });
  const r = normalizeKeiriApplication({
    shopName: "A店",
    phone: "090-0000-0000",
    email: "abc",
  });
  assert.equal(r.ok, false);
});

test("全角の空白だけの入力は「入っていない」と数える", () => {
  const r = normalizeKeiriApplication({
    shopName: "　　",
    phone: "090-0000-0000",
  });
  assert.equal(r.ok, false);
  assert.ok(
    (r as { ok: false; errors: string[] }).errors.some((m) => m.includes("お店の名前")),
  );
});

test("必須が2つとも空なら、足りないものを2つとも教える", () => {
  const r = normalizeKeiriApplication({});
  assert.equal(r.ok, false);
  const errors = (r as { ok: false; errors: string[] }).errors;
  assert.equal(errors.length, 2);
  assert.ok(errors.some((m) => m.includes("お店の名前")));
  assert.ok(errors.some((m) => m.includes("電話番号")));
});

test("メールアドレスの形がおかしいものは断る", () => {
  for (const bad of ["abc", "a@b", "a b@c.jp", "@example.com", "a@.jp", "a@b."]) {
    const r = normalizeKeiriApplication({
      shopName: "A店",
      phone: "090-0000-0000",
      email: bad,
    });
    assert.equal(r.ok, false, `通してはいけない: ${bad}`);
  }
});

test("長すぎる貼り付けは断る（上限ちょうどは通す）", () => {
  const justFit = "あ".repeat(KEIRI_APPLY_LIMITS.shopName);
  ok({ shopName: justFit, phone: "090-0000-0000" });

  const tooLong = "あ".repeat(KEIRI_APPLY_LIMITS.shopName + 1);
  const r = normalizeKeiriApplication({
    shopName: tooLong,
    phone: "090-0000-0000",
  });
  assert.equal(r.ok, false);
});

test("囮の欄が埋まっていたら機械。成功の顔をして、誰にも知らせない", () => {
  const r = normalizeKeiriApplication({
    shopName: "A店",
    phone: "090-0000-0000",
    website: "http://spam.example",
  });
  assert.equal(r.ok, true);
  assert.equal((r as { ok: true; spam: boolean }).spam, true);
  // 値を持たない＝この先の「知らせる・控える」に進みようがない
  assert.equal("value" in r, false);
});

test("文字でないもの（数値・オブジェクト）が来ても落ちない", () => {
  const r = normalizeKeiriApplication({
    shopName: 123,
    contactName: { a: 1 },
    phone: null,
  });
  assert.equal(r.ok, false);
});

test("知らせの本文に、折り返しに要るものが全部入っている", () => {
  const text = keiriApplyNotificationText({
    application: {
      shop_name: "屋台 手羽屋",
      contact_name: "川畑 潤一郎",
      email: "you@example.com",
      phone: "090-0000-0000",
      note: "月末の締めが大変です",
      campaign: null,
    },
    priceLabel: "月額15,000円（税込）／1店舗",
    at: new Date("2026-09-19T01:34:00+09:00"),
  });
  assert.ok(text.includes("お申し込みが1件入りました"));
  assert.ok(text.includes("屋台 手羽屋"));
  assert.ok(text.includes("川畑 潤一郎"));
  assert.ok(text.includes("you@example.com"));
  assert.ok(text.includes("090-0000-0000"));
  assert.ok(text.includes("月末の締めが大変です"));
  assert.ok(text.includes("月額15,000円（税込）／1店舗"));
  // 日本時間で出す（世界標準時のまま出すと9時間ずれた時刻が届く）
  assert.ok(text.includes("2026/09/19"), text);
});

test("任意の欄が無いときは、その行を出さない（空の行を送らない）", () => {
  const text = keiriApplyNotificationText({
    application: {
      shop_name: "A店",
      contact_name: "",
      email: "",
      phone: "090-0000-0000",
      note: null,
      campaign: null,
    },
    priceLabel: "月額15,000円（税込）／1店舗",
  });
  // ★電話は必ず入る（折り返しの唯一の道・kp207）
  assert.ok(text.includes("電話：090-0000-0000"));
  assert.ok(!text.includes("お名前："));
  assert.ok(!text.includes("メール："));
  assert.ok(!text.includes("ひとこと："));
});

test("申し込みページは公開ページの一覧に入っている（sitemap と robots に載る）", () => {
  const paths = KEIRI_PUBLIC_PAGES.map((p) => p.path);
  assert.ok(paths.includes("/keiri/apply"));
  // 紹介ページのすぐ後ろに置く（読み終えた人が次に押す所なので）
  assert.equal(paths.indexOf("/keiri/apply"), paths.indexOf("/keiri/case") + 1);
});

test("届けられなかったときのメール下書き：入れてもらった中身をそのまま入れる", () => {
  const mail = keiriApplyMailto({
    to: "jun@example.co.jp",
    shopName: "屋台 手羽屋",
    contactName: "川畑 潤一郎",
    email: "you@example.com",
    phone: "090-0000-0000",
    note: "レシートの入力が大変です",
  });
  assert.match(mail.subject, /屋台 手羽屋/);
  assert.match(mail.body, /お店：屋台 手羽屋/);
  assert.match(mail.body, /お名前：川畑 潤一郎/);
  assert.match(mail.body, /メール：you@example.com/);
  assert.match(mail.body, /電話：090-0000-0000/);
  assert.match(mail.body, /レシートの入力が大変です/);
  assert.ok(mail.url.startsWith("mailto:jun@example.co.jp?"));
  assert.ok(mail.url.includes("subject="));
  assert.ok(mail.url.includes(encodeURIComponent("屋台 手羽屋")));
});

// ── ここから kp63（2026-09-19）──────────────────────────────
// 今月は LINE も倉庫の控えも止まっていて、受け口は「メールの下書き」1本だけ。
// その宛先が司令室の読めない受信箱1つだけだと、申し込みが静かに消える。

test("メール下書き：既定で手羽屋のGmailにも写し（CC）が付く", () => {
  const mail = keiriApplyMailto({ to: "jun@example.co.jp", shopName: "手羽屋" });
  assert.equal(mail.cc, KEIRI_APPLY_COPY_TO);
  assert.ok(mail.url.includes(`cc=${encodeURIComponent(KEIRI_APPLY_COPY_TO)}`));
  // 届く先は2か所（To と写し）
  assert.deepEqual(mail.recipients, ["jun@example.co.jp", KEIRI_APPLY_COPY_TO]);
});

test("メール下書き：宛先と写しが同じときは二重に書かない", () => {
  const mail = keiriApplyMailto({ to: KEIRI_APPLY_COPY_TO, shopName: "手羽屋" });
  assert.equal(mail.cc, null);
  assert.ok(!mail.url.includes("cc="));
  assert.deepEqual(mail.recipients, [KEIRI_APPLY_COPY_TO]);
});

test("メール下書き：写しを付けないと明示したときは付かない", () => {
  const mail = keiriApplyMailto({ to: "a@b.co", cc: null, shopName: "手羽屋" });
  assert.equal(mail.cc, null);
  assert.deepEqual(mail.recipients, ["a@b.co"]);
});

test("本番の下書きは、特商法の連絡先と司令室の受信箱の2か所に届く", () => {
  const list = keiriApplyRecipients(KEIRI_COMPANY.email, KEIRI_APPLY_COPY_TO);
  assert.equal(list.length, 2);
  assert.ok(list.includes(KEIRI_COMPANY.email));
  assert.ok(list.includes(KEIRI_APPLY_COPY_TO));
});

test("特定商取引法のページに出す連絡先は変えない（表示は法律の話・写しは受け取りの話）", () => {
  assert.notEqual(KEIRI_COMPANY.email, KEIRI_APPLY_COPY_TO);
  assert.ok(
    tokushohoRows().some((r) => r.value === KEIRI_COMPANY.email),
    "特商法の表記の連絡先が、これまでどおり出ていること",
  );
});

test("メール下書き：任意の欄が空でも壊れない", () => {
  const mail = keiriApplyMailto({ to: "a@b.co", shopName: "", contactName: "", email: "" });
  assert.equal(mail.subject, "経理パッケージ お申し込み");
  assert.match(mail.body, /お店：（未記入）/);
  assert.ok(!mail.body.includes("電話："));
});

/* ------------------------------------------------------------------
 * 2026-09-19（kp69）
 * 「LINE には飛んだが、倉庫に控えが残らなかった」ときの念のための控え。
 *
 * いちばん危ない形は、画面が「受け付けました」と出るのに、
 * あとから一覧で見返せる形がどこにも無い状態。
 * LINE のグループは司令室からは読めないので、
 * 最初の1件が入っても気づかれないまま「申込0件」と書き続けることになる。
 * ------------------------------------------------------------------ */

test("控えの下書き：件名で「控え」と分かる（本物の申し込みと取り違えない）", () => {
  const mail = keiriApplyMailto({ to: "jun@example.co.jp", kind: "copy", shopName: "手羽屋" });
  assert.equal(mail.subject, "経理パッケージ お申し込みの控え（手羽屋）");
  assert.match(mail.body, /控えとしてお送りしています/);
  assert.ok(
    !mail.body.includes("送れなかったため"),
    "受け付けは済んでいるので、送れなかったとは書かない",
  );
});

test("控えの下書き：既定（fallback）の文面はこれまでどおり", () => {
  const mail = keiriApplyMailto({ to: "jun@example.co.jp", shopName: "手羽屋" });
  assert.equal(mail.subject, "経理パッケージ お申し込み（手羽屋）");
  assert.match(mail.body, /送れなかったため/);
  assert.ok(!mail.body.includes("控えとして"));
});

test("控えの下書きも、司令室の受信箱に写し（CC）が付く", () => {
  const mail = keiriApplyMailto({
    to: KEIRI_COMPANY.email,
    kind: "copy",
    shopName: "手羽屋",
    contactName: "川畑",
    email: "tencho@example.com",
  });
  assert.deepEqual(mail.recipients, [KEIRI_COMPANY.email, KEIRI_APPLY_COPY_TO]);
  assert.match(mail.body, /お名前：川畑/);
  assert.match(mail.body, /メール：tencho@example.com/);
});

// ------------------------------------------------------------
// 倉庫に流す SQL の約束（kp97）
//   2026-09-19 19:05、申し込みの棚に「表をまるごと空にする権利（TRUNCATE）」が
//   外から来る人に残っていた。Supabase が新しい表に自動で付ける既定のもので、
//   A が本番で取り上げたが、**倉庫のファイルに書かないと流し直しで黙って戻る**。
//   ここで固定しておく。
// ------------------------------------------------------------

test("SQL：申し込みの棚は、外から来る人に『入れる』以外を渡さない", () => {
  const files = [
    "supabase/migrations/keiri_applications_insert_only.sql",
    "supabase/migrations/keiri_applications_paid_pending.sql",
  ];

  for (const file of files) {
    const sql = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

    // ★この1行を消すと、流し直したときに「誰でも申し込みを全部消せる」状態へ戻る
    assert.match(
      sql,
      /revoke truncate, references, trigger on table public\.keiri_applications from anon, authenticated;/,
      `${file}：TRUNCATE などを anon, authenticated から取り上げていません`,
    );

    // 渡してよいのは INSERT だけ（読み出し・書き換え・削除は渡さない）
    const grants = sql
      .split("\n")
      .filter((l) => /^grant /.test(l.trim()) && l.includes("keiri_applications"));
    assert.ok(grants.length >= 1, `${file}：grant が1行も無い`);
    for (const line of grants) {
      assert.match(line, /^grant insert on table public\.keiri_applications to anon, authenticated;$/);
    }

    // 手羽屋が毎日使う表には触らない
    for (const table of ["daily_reports", "shifts", "setup_checks", "line_groups", "expenses"]) {
      assert.ok(!sql.includes(table), `${file} が ${table} に触れています`);
    }
  }
});

/**
 * どこから来た申し込みかを、記録に一緒に残す（2026-09-28・司令室 kp194）。
 *
 * ■ なぜ要るか
 *   紙の札（/keiri/card）のQRには合言葉（?from=card）が付いている。
 *   申し込みの控えにも同じ合言葉が残らないと、
 *   「紙を置いたことが申し込みにつながったのか」があとから分からない。
 *
 * ■ ここで必ず守ること
 *   倉庫の「どこから来たか」の欄（source）は **'form' のまま**にする。
 *   あの欄は入れてよい中身が 'form' だけに絞られていて（RLS）、
 *   変えると申し込みそのものが断られる。合言葉は「ひとこと」に1行として残す。
 */
test("合言葉（?from=card）は申し込みの記録に残る（kp194）", () => {
  const r = normalizeKeiriApplication({
    shopName: "A店",
    phone: "090-0000-0000",
    note: "月末の締めが大変です",
    campaign: "card",
  });
  assert.equal(r.ok, true);
  if (!r.ok || r.spam) throw new Error("受け取れていません");
  assert.equal(r.value.campaign, "card");
  assert.ok(r.value.note?.includes("月末の締めが大変です"));
  assert.ok(r.value.note?.includes("［どこから：card］"));
});

test("ひとことが空でも合言葉だけは残る。合言葉が無ければ今までどおり（kp194）", () => {
  const withMark = normalizeKeiriApplication({
    shopName: "A店",
    phone: "090-0000-0000",
    campaign: "card",
  });
  if (!withMark.ok || withMark.spam) throw new Error("受け取れていません");
  assert.equal(withMark.value.note, "［どこから：card］");

  const plain = normalizeKeiriApplication({
    shopName: "A店",
    phone: "090-0000-0000",
  });
  if (!plain.ok || plain.spam) throw new Error("受け取れていません");
  assert.equal(plain.value.note, null);
  assert.equal(plain.value.campaign, null);
});

test("合言葉に余分な記号が付いてきても、同じ合言葉として残る（kp195と対）", () => {
  const r = normalizeKeiriApplication({
    shopName: "A店",
    phone: "090-0000-0000",
    campaign: "card`",
  });
  if (!r.ok || r.spam) throw new Error("受け取れていません");
  assert.equal(r.value.campaign, "card");
});

test("知らせの本文では、どこから来たかを1行で出し、ひとことに重ねない（kp194）", () => {
  const text = keiriApplyNotificationText({
    application: {
      shop_name: "A店",
      contact_name: "山田",
      email: "a@b.jp",
      phone: "090-0000-0000",
      note: "月末の締めが大変です\n［どこから：card］",
      campaign: "card",
    },
    priceLabel: "月額15,000円（税込）／1店舗",
    at: new Date("2026-09-28T18:34:00+09:00"),
  });
  assert.ok(text.includes("どこから：card"));
  assert.ok(text.includes("ひとこと：月末の締めが大変です"));
  // 同じことを2回言わない
  assert.equal(text.split("［どこから：card］").length - 1, 0);
});

test("倉庫に入れるときの「どこから来たか」の欄は form のまま（変えると申し込みが断られる）", () => {
  const route = readFileSync("app/api/keiri/apply/route.ts", "utf8");
  assert.ok(
    route.includes('source: "form"'),
    "source は 'form' のままにしてください（棚の決まりが form だけを通します）",
  );
});
