/**
 * 「メールでも受け付けています」の導線と、売るページのフッターを固定する（kp72）。
 *
 * ここが狂うと、最初の1件が
 *   ・司令室が読めない受信箱だけに届いて気づかれない
 *   ・売り込みのページから他店の業務システムへ入れてしまう
 * のどちらかになる。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KEIRI_APPLY_COPY_TO, keiriContactMailto } from "../lib/keiri/apply";
import { KEIRI_COMPANY } from "../lib/keiri/legal";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf-8");

test("お問い合わせの下書きは、司令室の受信箱にも届く（2か所）", () => {
  const mail = keiriContactMailto({ to: KEIRI_COMPANY.email });
  assert.deepEqual(mail.recipients, [KEIRI_COMPANY.email, KEIRI_APPLY_COPY_TO]);
  assert.equal(mail.cc, KEIRI_APPLY_COPY_TO);
  assert.ok(
    mail.url.includes(`cc=${encodeURIComponent(KEIRI_APPLY_COPY_TO)}`),
    "写し（CC）が下書きのリンクに入っていること",
  );
  assert.ok(mail.url.startsWith(`mailto:${KEIRI_COMPANY.email}?`));
});

test("お問い合わせの下書き：件名と、埋めるだけの雛形が入っている", () => {
  const mail = keiriContactMailto({ to: KEIRI_COMPANY.email });
  assert.equal(mail.subject, "経理パッケージのお問い合わせ");
  for (const label of ["お店：", "お名前：", "聞きたいこと："]) {
    assert.ok(mail.body.includes(label), `雛形に「${label}」があること`);
  }
  assert.ok(
    !mail.body.includes("申し込みます"),
    "問い合わせの下書きなので、申し込みの文面にはしない",
  );
});

test("宛先と写しが同じときは、二重に書かない", () => {
  const mail = keiriContactMailto({ to: KEIRI_APPLY_COPY_TO });
  assert.equal(mail.cc, null);
  assert.deepEqual(mail.recipients, [KEIRI_APPLY_COPY_TO]);
  assert.ok(!mail.url.includes("cc="));
});

test("写しを付けない指定もできる（いままでどおりの素の宛先）", () => {
  const mail = keiriContactMailto({ to: KEIRI_COMPANY.email, cc: null });
  assert.equal(mail.cc, null);
  assert.deepEqual(mail.recipients, [KEIRI_COMPANY.email]);
});

test("売るページの「メールでも受け付けています」は、素の mailto のままにしない", () => {
  for (const page of [
    "app/keiri/case/page.tsx",
    "app/keiri/apply/page.tsx",
    // ★特定商取引法のページ（2026-09-19 追加）。
    //   8通を受け取った店主が、申し込む前・解約するときに必ず開くページ。
    //   ここだけ素の文字のままで、押しても下書きが開かず、写し（CC）も付かなかった。
    //   ＝このページを見て連絡した1件は、司令室の見ていない受信箱に1通だけ届く。
    "app/keiri/legal/page.tsx",
  ]) {
    const src = read(page);
    assert.ok(
      src.includes("keiriContactMailto"),
      `${page} は下書き付きのリンクを使うこと（写しが付かないと司令室が気づけない）`,
    );
    assert.ok(
      !src.includes("`mailto:${KEIRI_COMPANY.email}`"),
      `${page} に素の mailto が残っていないこと`,
    );
  }
});

test("売るページのフッターから、手羽屋の業務システムへの入口を出さない", () => {
  const nav = read("app/keiri/components/nav.tsx");
  assert.ok(
    !nav.includes("手羽屋 業務システムへ戻る"),
    "外のお店に送るページから、他店の業務システムへの戻り道は置かない",
  );
  for (const page of ["app/keiri/case/page.tsx", "app/keiri/apply/page.tsx"]) {
    assert.ok(
      !read(page).includes("<KeiriFooter home"),
      `${page} のフッターに home を渡さないこと`,
    );
  }
});

test("特定商取引法に出す連絡先は、これまでどおり変えていない", () => {
  assert.equal(KEIRI_COMPANY.email, "jun@alpha-mj.co.jp");
  assert.ok(
    !read("lib/keiri/legal.ts").includes(KEIRI_APPLY_COPY_TO),
    "表示は法律の話・写しは受け取りの話。特商法の連絡先に写しの宛先を混ぜない",
  );
});

test("特商法のページの連絡先は、押すと写し付きの下書きが開く（表示する文字は変えない）", () => {
  const src = read("app/keiri/legal/page.tsx");
  assert.ok(
    src.includes("keiriContactMailto"),
    "特商法のページも下書き付きのリンクを使うこと（写しが付かないと司令室が気づけない）",
  );
  assert.ok(
    src.includes("{KEIRI_COMPANY.email}"),
    "画面に出す文字は、これまでどおり KEIRI_COMPANY.email をそのまま出すこと",
  );
  assert.ok(
    !src.includes(KEIRI_APPLY_COPY_TO),
    "写しの宛先を画面の文字として出さない（表示は法律の話・写しは受け取りの話）",
  );
});

/* ──────────────────────────────────────────────────────────────
 * 2026-09-20 追加（司令室 kp112）
 *
 * 上の守りは「`mailto:${KEIRI_COMPANY.email}` という**そのままの文字**が
 * 3ページに残っていないか」しか見ていなかった。
 * ところが同じ間違いを *別の変数名* で書くと、そのまま通り抜けていた：
 *   ・app/keiri/apply/ApplyForm.tsx … `mailto:${email}`（申し込み完了の「お急ぎのときは」）
 *   ・app/keiri/help/page.tsx        … `mailto:${mail}`（困ったときの窓口）
 * どちらも写し（CC）が付かないので、そこから来た連絡は
 * 司令室が毎時間見ている受信箱に1通も届かない。
 *
 * ＝ 変数名に頼るのをやめ、**app/keiri の下に "mailto:" の文字が1つも無いこと**を守る。
 *   下書きのリンクは lib/keiri/*.ts（keiriApplyMailto / keiriContactMailto）だけが作る。
 *   こうしておけば、次に誰がどんな変数名で書いても、その場でテストが落ちる。
 * ────────────────────────────────────────────────────────────── */

import { readdirSync, statSync } from "node:fs";
import { keiriApplyMailto } from "../lib/keiri/apply";

/** app/keiri の下のファイルを全部あげる（入れ物の中まで見る） */
function filesUnder(dir: string): string[] {
  const base = new URL(`../${dir}/`, import.meta.url);
  const out: string[] = [];
  for (const name of readdirSync(base)) {
    const rel = `${dir}/${name}`;
    if (statSync(new URL(`../${rel}`, import.meta.url)).isDirectory()) {
      out.push(...filesUnder(rel));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}

test("経理パッケージの画面には、素の mailto を1つも書かない（変数名に頼らない）", () => {
  const files = filesUnder("app/keiri");
  assert.ok(files.length >= 15, `画面のファイルが数えられていること（${files.length}件）`);
  const offenders = files.filter((f) => read(f).includes("mailto:"));
  assert.deepEqual(
    offenders,
    [],
    "下書きのリンクは lib/keiri の keiriApplyMailto / keiriContactMailto だけが作ること" +
      "（写しが付かない宛先を画面に置くと、そこから来た連絡に司令室が気づけない）",
  );
});

test("お申し込み完了の「お急ぎのときは」も、写し付きの下書きが開く", () => {
  const mail = keiriApplyMailto({
    to: KEIRI_COMPANY.email,
    kind: "hurry",
    shopName: "テスト屋",
    contactName: "川畑",
    email: "shop@example.com",
  });
  assert.equal(mail.cc, KEIRI_APPLY_COPY_TO);
  assert.deepEqual(mail.recipients, [KEIRI_COMPANY.email, KEIRI_APPLY_COPY_TO]);
  assert.equal(mail.subject, "経理パッケージ お申し込みのお急ぎのご連絡（テスト屋）");
  // すでに受け付けが済んでいることを、こちらが読んで分かる形にしておく
  assert.ok(mail.body.includes("お急ぎでご連絡します。"));
  assert.ok(mail.body.includes("受け付けは済んでいます"));
  // 打ち直しをさせない＝入れてもらった中身がそのまま入っている
  assert.ok(mail.body.includes("テスト屋"));
  assert.ok(mail.body.includes("shop@example.com"));
  assert.ok(!mail.body.includes("送れなかったため"), "届かなかったときの文面と混ぜない");
});

test("困ったときの窓口は、使い方の質問用の下書きになる（写しも付く）", () => {
  const mail = keiriContactMailto({ to: KEIRI_COMPANY.email, kind: "support" });
  assert.equal(mail.cc, KEIRI_APPLY_COPY_TO);
  assert.equal(mail.subject, "経理パッケージ 使い方のご質問");
  assert.ok(mail.body.includes("使い方で分からないところがあります。"));
  assert.ok(mail.body.includes("困っていること："));
  assert.ok(!mail.body.includes("申し込みます"), "問い合わせの下書きを申し込みの文面にしない");
});

test("買う前の問い合わせの文面は、これまでどおり変えていない", () => {
  const before = keiriContactMailto({ to: KEIRI_COMPANY.email });
  assert.equal(before.subject, "経理パッケージのお問い合わせ");
  assert.ok(before.body.includes("聞きたいこと："));
});

test("画面ごとに、どの下書きを使うかを決めておく", () => {
  assert.ok(
    read("app/keiri/help/page.tsx").includes('keiriContactMailto({ to: mail, kind: "support" })'),
    "困ったときのページは support の下書きを使うこと",
  );
  assert.ok(
    read("app/keiri/apply/ApplyForm.tsx").includes('kind: "hurry"'),
    "お申し込み完了の「お急ぎのときは」は hurry の下書きを使うこと",
  );
});
