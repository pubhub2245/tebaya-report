/**
 * リンクを貼ったときに出る「カード」の中身を固定する。
 *
 * ここが崩れると、じゅんが送る1通を受け取った店主が
 * それを人に転送・LINEに貼って相談したときに、
 * 白い箱や「手羽屋 営業後日報」という別物の名前で出てしまい、
 * 開かれる前に終わる。数字（申込）に直接効くので、テストで留めておく。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { KEIRI_OGP_IMAGE, keiriMetadata } from "../lib/keiri/metadata";

test("カードには絵が付く（1200×630・倉庫の中の PNG）", () => {
  const m = keiriMetadata({
    path: "/keiri/case",
    title: "題名",
    description: "説明",
    type: "website",
  });
  const images = m.openGraph?.images as { url: string; width: number; height: number }[];
  assert.ok(Array.isArray(images) && images.length === 1);
  assert.equal(images[0].url, "/keiri/ogp.png");
  assert.equal(images[0].width, 1200);
  assert.equal(images[0].height, 630);
});

test("絵の実物が倉庫にあり、1200×630 の PNG である", () => {
  const file = path.join(process.cwd(), "public", KEIRI_OGP_IMAGE.url);
  const buf = fs.readFileSync(file);
  // PNG の先頭の決まった並び
  assert.equal(buf.subarray(1, 4).toString("ascii"), "PNG");
  // 大きさは PNG の先頭 33 バイトの中に入っている
  assert.equal(buf.readUInt32BE(16), 1200);
  assert.equal(buf.readUInt32BE(20), 630);
});

test("題名と説明は、ページが持っているものがそのまま入る", () => {
  const m = keiriMetadata({ path: "/keiri/demo", title: "お試し版", description: "説明文" });
  assert.equal(m.openGraph?.title, "お試し版");
  assert.equal(m.openGraph?.description, "説明文");
  assert.equal(m.twitter?.title, "お試し版");
  assert.equal((m.openGraph as { siteName?: string }).siteName, "経理パッケージ");
  assert.equal((m.twitter as { card?: string }).card, "summary_large_image");
});

test("外向きページは1つ残らず、自分の題名のカードを持っている", () => {
  // keiriMetadata を使っていないページがあると、そのページだけ
  // サイト全体の題名（手羽屋の日報アプリ）で出てしまう。
  const dir = path.join(process.cwd(), "app", "keiri");
  // 外向きではない画面（カードが要らない画面）だけ、ここで外す。
  //   welcome / advances … 申し込んだお店の人だけが使う画面
  //   send … じゅんだけが開く「送る1枚」（noindex・sitemap にも載せない・kp162）
  const skip = new Set(["welcome", "advances", "components", "send"]);
  const missing: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (rel === "" && skip.has(e.name)) continue;
      const next = path.join(d, e.name);
      const page = path.join(next, "page.tsx");
      if (fs.existsSync(page)) {
        const src = fs.readFileSync(page, "utf8");
        if (!src.includes("keiriMetadata(")) missing.push(path.join(rel, e.name));
      }
      walk(next, path.join(rel, e.name));
    }
  };
  walk(dir, "");
  assert.deepEqual(missing, []);
});
