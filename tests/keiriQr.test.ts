/**
 * QRコードを自分で組み立てる所（lib/keiri/qr.ts）を固定する。
 *
 * ■ なぜ検算が要るか
 *   QRは**目で見て正しさが分からない**唯一の部品です。1ますずれただけで
 *   「読み取れない絵」になりますが、画面には立派なQRらしいものが出ます。
 *   その1枚を出店先で相手のスマホに向けて読み取れなければ、その場が終わります。
 *   ですので「読み戻して同じ住所に戻るか」を、毎回のテストで確かめます。
 *
 * ■ ここでやる確かめ（3つ）
 *   ① **読み戻し**：作ったます目から、書式の札 → 隠し模様 → 符号 → 文字 の順に
 *      自分で戻して、元の文字と一致するか。長さのちがう3通りで見る
 *   ② **ます目そのもの**：ご案内ページの住所ぶんを1ますずつ控えと突き合わせる
 *      （控えは、よその読み取り機（OpenCV）に実際に読ませて
 *       `https://tebaya-report.vercel.app/keiri/case` に戻ることを確かめた版）
 *   ③ 入らない長さは、黙って切り捨てずにエラーで止まるか
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  qrBlockSpec,
  qrMaskAt,
  qrMatrix,
  qrModulePositions,
} from "../lib/keiri/qr";
import { SHOW_TAKEAWAY_URL } from "../lib/keiri/show";

/**
 * ご案内ページの住所は第4型（33ます）になる。その型の「そろえ用の目印」の中心。
 * 時計の列と重なる所だけ、交互の確かめから外すために使う。
 */
const ALIGNMENT_CENTERS = [6, 26];

/** ます目から住所を読み戻す（作る側とは別の向きの手順で書く） */
function decode(matrix: boolean[][]): string {
  const size = matrix.length;
  const version = (size - 17) / 4;
  assert.ok(Number.isInteger(version) && version >= 1 && version <= 6, "型が1〜6でない");

  // ① 書式の札から、使われた隠し模様の番号を読む
  let bits = 0;
  const read = (x: number, y: number) => (matrix[y][x] ? 1 : 0);
  for (let i = 0; i <= 5; i += 1) bits |= read(8, i) << i;
  bits |= read(8, 7) << 6;
  bits |= read(8, 8) << 7;
  bits |= read(7, 8) << 8;
  for (let i = 9; i < 15; i += 1) bits |= read(14 - i, 8) << i;
  const format = (bits ^ 0x5412) >>> 10;
  const ecLevel = format >>> 3;
  const mask = format & 0b111;
  assert.equal(ecLevel, 0b00, "まちがい直しの強さが M でない");

  // ② 隠し模様を外しながら、符号を置いた順に拾う
  const positions = qrModulePositions(version);
  const spec = qrBlockSpec(version);
  const totalCodewords = spec.blocks.reduce((a, b) => a + b, 0) + spec.ecPerBlock * spec.blocks.length;
  const stream: number[] = [];
  for (let i = 0; i < totalCodewords * 8; i += 1) {
    const [x, y] = positions[i];
    const dark = matrix[y][x] !== qrMaskAt(mask, x, y);
    stream.push(dark ? 1 : 0);
  }
  const codewords: number[] = [];
  for (let i = 0; i < stream.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | stream[i + j];
    codewords.push(byte);
  }

  // ③ かたまりをまたいで拾ってあるので、かたまりごとに戻す
  const blocks: number[][] = spec.blocks.map(() => []);
  const maxData = Math.max(...spec.blocks);
  let at = 0;
  for (let i = 0; i < maxData; i += 1) {
    for (let b = 0; b < spec.blocks.length; b += 1) {
      if (i < spec.blocks[b]) {
        blocks[b].push(codewords[at]);
        at += 1;
      }
    }
  }
  const data = blocks.flat();

  // ④ 種類（0100＝ふつうの文字）と文字数を読み、その数だけ取り出す
  const dataBits: number[] = [];
  for (const byte of data) for (let i = 7; i >= 0; i -= 1) dataBits.push((byte >>> i) & 1);
  const take = (from: number, length: number) => {
    let v = 0;
    for (let i = 0; i < length; i += 1) v = (v << 1) | dataBits[from + i];
    return v;
  };
  assert.equal(take(0, 4), 0b0100, "ふつうの文字（バイトモード）になっていない");
  const length = take(4, 8);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = take(12 + i * 8, 8);
  return new TextDecoder().decode(bytes);
}

test("① 作ったQRを読み戻すと、元の住所にちょうど戻る", () => {
  const samples = [
    SHOW_TAKEAWAY_URL,
    "https://example.com",
    // 第6型（108文字）いっぱいに近い長さ。型が上がっても崩れないことを見る
    `${SHOW_TAKEAWAY_URL}?${"a".repeat(60)}`,
  ];
  for (const text of samples) {
    assert.equal(decode(qrMatrix(text)), text, `読み戻しが合わない：${text}`);
  }
});

test("① 角の目印・時計の列・いつも黒い1ますが決まりどおりにある", () => {
  const m = qrMatrix(SHOW_TAKEAWAY_URL);
  const size = m.length;
  // 角の目印は「黒3×3 → 白の輪 → 黒の枠」の順
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    assert.equal(m[cy][cx], true, "目印の中心が黒でない");
    assert.equal(m[cy][cx + 2], false, "目印の白い輪が白でない");
    assert.equal(m[cy][cx + 3], true, "目印の外枠が黒でない");
  }
  // 時計の列は白黒が交互（そろえ用の目印が重なる所は、そちらが上に来るので外す）
  const alignmentBand = (i: number) => ALIGNMENT_CENTERS.some((c) => Math.abs(i - c) <= 2);
  for (let i = 8; i < size - 8; i += 1) {
    if (alignmentBand(i)) continue;
    assert.equal(m[6][i], i % 2 === 0, "時計の列（横）が交互でない");
    assert.equal(m[i][6], i % 2 === 0, "時計の列（縦）が交互でない");
  }
  // いつも黒い1ます
  assert.equal(m[size - 8][8], true, "いつも黒い1ますが黒でない");
});

test("② ご案内ページのQRは、読み取り機で確かめた控えと1ますも変わらない", () => {
  const expected = readFileSync(new URL("./fixtures/keiri-case-qr.txt", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .map((line) => line.trim());
  const m = qrMatrix(SHOW_TAKEAWAY_URL);
  assert.equal(m.length, expected.length, "QRの1辺のます数が控えと違う");
  const actual = m.map((row) => row.map((d) => (d ? "1" : "0")).join(""));
  assert.deepEqual(actual, expected, "QRのます目が控えと違う（読み取れるか確かめ直すこと）");
});

test("③ 入らない長さは、黙って切らずにエラーで止まる", () => {
  assert.throws(() => qrMatrix("a".repeat(200)), /QRに入りません/);
});
