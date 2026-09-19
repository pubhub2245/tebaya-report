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
