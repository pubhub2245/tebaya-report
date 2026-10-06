/**
 * 「この場で代わりに登録する」欄（/keiri/show のいちばん下・kp211・2026-10-01）の
 * 決めごとを固定する。
 *
 * 崩れると次のどれかが起きるので、戻り止めを置く。
 *   ・相手の目の前の画面に、他のお店の名前や電話番号が出る
 *   ・ふだんのお申し込みと別の受け皿に入って、申込の数が合わなくなる
 *   ・合言葉が紙（card）や見せる1枚（show）と混ざって、どの一手が効いたか分からなくなる
 *   ・相手に見せる4画面が変わってしまう（この欄は4画面のうしろに足すだけ）
 *   ・値段・解約の条件が、この欄で勝手に言い換えられる
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KEIRI_PRICE } from "../lib/keiri/caseNumbers";
import { CARD_FROM_KEY } from "../lib/keiri/card";
import { TRIAL_FROM_KEY } from "../lib/keiri/trial";
import { APP_FROM_KEY } from "../lib/keiri/appLink";
import { README_FROM_KEY } from "../lib/keiri/readmeLink";
import { cleanCampaign } from "../lib/siteVisits";
import {
  ONSITE_AGAIN_LABEL,
  ONSITE_DONE_LABEL,
  ONSITE_EDIT_LABEL,
  ONSITE_FAIL_LABEL,
  ONSITE_FIELD_LABELS,
  ONSITE_FROM_KEY,
  ONSITE_KEEP_TITLE,
  ONSITE_OPEN_LABEL,
  ONSITE_RETRY_LABEL,
  ONSITE_SUBMIT_LABEL,
  SHOW_FROM_KEY,
} from "../lib/keiri/show";
import { normalizeKeiriApplication } from "../lib/keiri/apply";

const form = readFileSync(
  new URL("../app/keiri/show/OnsiteApplyForm.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("../app/keiri/show/page.tsx", import.meta.url), "utf8");

/**
 * 説明文（コメント）を外した、動く部分だけ。
 * 「この言葉が出ていないこと」を確かめるとき、説明文まで数えると
 * 『なぜそうしたか』を書けなくなるので、動く部分だけを見る。
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const formCode = codeOnly(form);

test("合言葉は onsite で、他の入口5本と重なっていない", () => {
  assert.equal(ONSITE_FROM_KEY, "onsite");
  const others = [CARD_FROM_KEY, SHOW_FROM_KEY, TRIAL_FROM_KEY, APP_FROM_KEY, README_FROM_KEY];
  assert.ok(
    !others.includes(ONSITE_FROM_KEY),
    `合言葉が他の入口と重なっている：${ONSITE_FROM_KEY}`,
  );
  assert.match(ONSITE_FROM_KEY, /^[a-z]+$/, "合言葉は小文字の英字だけにする");
});

test("合言葉が、受け取る側の掃除を通しても1文字も変わらない", () => {
  assert.equal(cleanCampaign(ONSITE_FROM_KEY), ONSITE_FROM_KEY);
});

test("送り先は、ふだんのお申し込みとまったく同じ1か所だけ", () => {
  assert.ok(form.includes('"/api/keiri/apply"'), "ふだんの受け口に送っていない");
  assert.equal(
    (form.match(/fetch\(/g) ?? []).length,
    1,
    "送り先が2か所以上ある（受け皿が分かれると申込の数が合わなくなる）",
  );
  assert.ok(form.includes("ONSITE_FROM_KEY"), "合言葉を付けずに送っている");
});

test("別の画面へ飛ばさない（同じ画面の中で終わる）", () => {
  assert.ok(!/from "next\/link"/.test(form), "別の画面へのリンクを置いている");
  assert.ok(!/window\.location\s*=/.test(form), "別の画面へ飛ばしている");
  assert.ok(!/useRouter|redirect\(/.test(form), "別の画面へ飛ばしている");
});

test("必ず打ち込むのは2つだけ（お店の名前・電話番号）", () => {
  assert.deepEqual(Object.keys(ONSITE_FIELD_LABELS), ["shopName", "phone"]);
  // 画面の入力欄も、この2つだけ
  const names = (formCode.match(/\n\s+name="([a-zA-Z]+)"/g) ?? []).map((m) =>
    m.replace(/[\s\S]*name="/, "").replace('"', ""),
  );
  assert.deepEqual(names.sort(), ["phone", "shopName"]);
  // 受け取る側も、この2つだけで通る
  const parsed = normalizeKeiriApplication({
    shopName: "屋台 ためし",
    phone: "090-0000-0000",
    campaign: ONSITE_FROM_KEY,
  });
  assert.ok(parsed.ok, "2つだけでは申し込みが通らない");
  if (parsed.ok && !parsed.spam) {
    assert.equal(parsed.value.campaign, ONSITE_FROM_KEY, "合言葉が落ちている");
    assert.ok(
      (parsed.value.note ?? "").includes(ONSITE_FROM_KEY),
      "どこから来たかが控えに残らない",
    );
  }
});

test("相手の目の前で出る文に、他のお店のことが出ようがない", () => {
  // 過去の申し込みを1件も読まない＝他のお店の名前・電話が出る道が無い
  assert.ok(!/keiri_applications/.test(formCode), "過去の申し込みを読んでいる");
  assert.ok(!/applications/.test(formCode), "申し込みの一覧を読んでいる");
  // 送れたとき・送れなかったときに出す文は、固定の1行だけ
  assert.ok(ONSITE_DONE_LABEL.includes("登録しました"), "送れたときの文が違う");
  assert.ok(ONSITE_FAIL_LABEL.length > 0, "送れなかったときの文が無い");
});

test("値段・解約の条件は、この欄では1文字も言い換えない", () => {
  assert.ok(
    !formCode.includes(String(KEIRI_PRICE.monthlyYenTaxIncluded)),
    "金額が直書きされている",
  );
  assert.ok(!/15,000|解約|やめられ/.test(formCode), "値段・解約の言い方をこの欄で書いている");
});

test("文章は lib/keiri/show.ts からだけ出す（画面に直書きしない）", () => {
  for (const label of [ONSITE_OPEN_LABEL, ONSITE_SUBMIT_LABEL, ONSITE_DONE_LABEL]) {
    assert.ok(!form.includes(`>${label}<`), `画面に文章が直書きされている：${label}`);
  }
});

test("相手に見せる4画面は、この欄を足しても1文字も変わっていない", () => {
  // 欄は4画面（snap）のうしろ。4画面の中に入れない
  const lastScreen = page.lastIndexOf('step="4 / 4"');
  assert.ok(
    page.indexOf("<OnsiteApplyForm />") > lastScreen,
    "欄が4画面の中に入っている",
  );
  for (const step of ["1 / 4", "2 / 4", "3 / 4", "4 / 4"]) {
    assert.ok(page.includes(`step="${step}"`), `${step} の画面が無くなっている`);
  }
  assert.equal(
    (page.match(/<ApplyButton \/>/g) ?? []).length,
    2,
    "相手が押す所の数が変わっている",
  );
});

test("欄そのものは JavaScript が動かなくても開く（<details> で開く）", () => {
  assert.ok(form.includes("<details"), "開く所が JS 頼みになっている");
  assert.ok(!page.includes('"use client"'), "この1枚ぜんたいが JS 前提になった");
  assert.ok(!page.includes("useState"), "この1枚ぜんたいが JS 前提になった");
});

/* ===== 2026-10-02・kp215 ここから =====
 * 説明会の会場は電波が細いことがあり、続けて2軒・3軒とうかがう場面もふつうに起きる。
 * そこで崩れると「うかがった1件を落とす」ので、戻り止めを置く。
 */

test("送れなかったとき、うかがった2つが画面から消えない", () => {
  // うかがった2つを持っておく入れ物がある
  assert.match(formCode, /useState<Heard>/, "うかがった2つを持っていない");
  // 送れなかった画面に、その2つをそのまま出している
  assert.ok(formCode.includes("heard.shopName"), "お店の名前が出ていない");
  assert.ok(formCode.includes("heard.phone"), "電話番号が出ていない");
  assert.ok(ONSITE_KEEP_TITLE.length > 0, "控えの見出しが無い");
});

test("送れなかったとき、打ち直す欄にも うかがった2つが入ったまま", () => {
  // 欄に入れ直している（空の欄に戻さない）
  assert.ok(
    formCode.includes("defaultValue={heard.shopName}"),
    "お店の名前が欄に入らない",
  );
  assert.ok(formCode.includes("defaultValue={heard.phone}"), "電話番号が欄に入らない");
  // 欄を空に戻すのは「次のお店」のときだけ＝送れなかったときに番号を増やさない
  assert.ok(formCode.includes("key={round}"), "欄を空に戻す仕掛けが無い");
  assert.equal(
    (formCode.match(/setRound\(/g) ?? []).length,
    1,
    "欄を空に戻す所が増えている（送れなかったときに消える恐れ）",
  );
  assert.match(
    formCode,
    /function nextShop\(\)[\s\S]*?setRound\(/,
    "欄を空に戻すのが「次のお店」以外から呼ばれている",
  );
});

test("送れなかったとき、同じ2つをそのまま送り直せる", () => {
  assert.ok(formCode.includes("send(heard)"), "同じ2つを送り直す道が無い");
  assert.ok(ONSITE_RETRY_LABEL.length > 0, "送り直す押し所の文が無い");
  assert.ok(ONSITE_EDIT_LABEL.length > 0, "打ち直す押し所の文が無い");
});

test("送れたあと、ページを開き直さずに次のお店を登録できる", () => {
  // 押し所が画面に出ていること（関数があるだけでは、押せないので意味がない）
  assert.equal(
    (formCode.match(/onClick=\{nextShop\}/g) ?? []).length,
    1,
    "次のお店へ進む押し所が画面に出ていない",
  );
  assert.ok(ONSITE_AGAIN_LABEL.length > 0, "次のお店の押し所の文が無い");
  // 次のお店に進むときは、前の方の2つを必ず消す（相手の目の前に前の方の情報を残さない）
  assert.match(
    formCode,
    /function nextShop\(\) \{\s*setHeard\(NOTHING_HEARD\);/,
    "次のお店に進むときに、前の方の2つが消えていない",
  );
  // 開き直しに頼らない＝画面の読み込み直しを呼んでいない
  assert.ok(!/location\.reload/.test(formCode), "ページの開き直しに頼っている");
});

test("足した文も lib/keiri/show.ts からだけ出す（画面に直書きしない）", () => {
  for (const label of [
    ONSITE_AGAIN_LABEL,
    ONSITE_RETRY_LABEL,
    ONSITE_EDIT_LABEL,
    ONSITE_KEEP_TITLE,
  ]) {
    assert.ok(!form.includes(`>${label}<`), `画面に文章が直書きされている：${label}`);
  }
  // 前の形で直書きされていた「もう一度入れる」は残っていない
  assert.ok(!form.includes("もう一度入れる"), "古い直書きの文が残っている");
});

test("送り先・合言葉・受け皿は、この直しで1つも変わっていない", () => {
  assert.equal((formCode.match(/\/api\/keiri\/apply/g) ?? []).length, 1, "送り先が増えている");
  assert.equal(
    (formCode.match(/campaign: ONSITE_FROM_KEY/g) ?? []).length,
    1,
    "合言葉の付け方が変わっている",
  );
  assert.equal((formCode.match(/fetch\(/g) ?? []).length, 1, "外に出る所が増えている");
});
