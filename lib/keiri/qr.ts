/**
 * QRコードを、この中だけで作る（外の道具も、外へのお願いも使わない）。
 *
 * ■ なぜ自分で作るか
 *   「その場で見せる1枚」（/keiri/show）は、立ち話のあいだに相手が
 *   **自分のスマホで読み取って持ち帰る**ための道です。
 *   よその絵づくりサービスに毎回お願いする作りにすると、
 *   ①その場で通信が細いと絵が出ない ②相手に見せた住所が外に渡る
 *   ③相手のサービスが止まった日にこちらのページも欠ける、の3つが起きます。
 *   ですので**番地（URL）から白黒のますを自分で組み、その場でSVGにして出す**形にします。
 *   お金は1円もかかりません（外に何も頼まないので）。
 *
 * ■ どこまで作るか（作りすぎない）
 *   ・入れるのは**ふつうの文字（バイトモード）**だけ。番地を入れるのに要るのはこれだけです
 *   ・まちがい直しの強さは **M（15%まで汚れても読める）**。印刷ではなく画面に出すので十分です
 *   ・大きさは **第1〜6型**（21〜41ます）。第7型から「型番の札」が要るので、そこは作りません。
 *     第6型で108文字まで入るので、番地には十分です（今の番地は41文字）
 *   ・入らない長さを渡されたら **エラーで止まる**（黙って切り捨てて、読めない絵を出さない）
 *
 * ■ 正しさの確かめ方
 *   tests/keiriQr.test.ts で、**よその実装（Python の qrcode）が出したます目**と
 *   1ますずつ突き合わせています。さらに、作った絵を実際に
 *   読み取り機（OpenCV）にかけて番地に戻ることを確かめた控えを置いてあります。
 *   （仕様：ISO/IEC 18004。組み方は公知の手順に沿っています）
 */

/** まちがい直しの強さ M の、型ごとの決めごと */
type EcBlockSpec = {
  /** 1かたまりぶんの直し符号の数 */
  ecPerBlock: number;
  /** かたまりごとの、本文の符号の数 */
  blocks: number[];
};

/**
 * 第1〜6型・強さ M の決めごと（ISO/IEC 18004 の表そのまま）。
 * 合計＝(本文＋直し)×かたまり数 が、その型に入る符号の総数と合う。
 */
const EC_M: Record<number, EcBlockSpec> = {
  1: { ecPerBlock: 10, blocks: [16] },
  2: { ecPerBlock: 16, blocks: [28] },
  3: { ecPerBlock: 26, blocks: [44] },
  4: { ecPerBlock: 18, blocks: [32, 32] },
  5: { ecPerBlock: 24, blocks: [43, 43] },
  6: { ecPerBlock: 16, blocks: [27, 27, 27, 27] },
};

/** 型ごとの「そろえ用の目印」の中心の座標（第1型は無し） */
const ALIGNMENT_COORDS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

/** いちばん小さい型（1〜6）に入れる。入らなければ null */
export function chooseVersion(byteLength: number): number | null {
  for (let v = 1; v <= 6; v += 1) {
    const spec = EC_M[v];
    const dataCodewords = spec.blocks.reduce((a, b) => a + b, 0);
    // 4ビット（種類）＋8ビット（文字数）＋本文
    const needBits = 4 + 8 + byteLength * 8;
    if (needBits <= dataCodewords * 8) return v;
  }
  return null;
}

/** GF(256) のかけ算（0x11D で割った余り。QRの決めごと） */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** 直し符号を作るための割る数（次数 = 直し符号の数） */
function ecDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** 本文の符号から直し符号を出す */
function ecRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < divisor.length; i += 1) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }
  return result;
}

/** 文字列を UTF-8 のバイト列にする */
function toBytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** 本文＋直し符号を、読み取り機が読む順番に並べた1本にする */
function buildCodewords(text: string, version: number): number[] {
  const spec = EC_M[version];
  const bytes = toBytes(text);
  const dataCodewords = spec.blocks.reduce((a, b) => a + b, 0);

  // ① ビットを並べる（種類0100＋文字数8ビット＋本文）
  const bits: number[] = [];
  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);

  // ② 終わりの印（最大4ビットの0）と、8の倍数までの0
  const capacityBits = dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < capacityBits; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  // ③ 余りは 0xEC / 0x11 を交互に詰める（決めごと）
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  for (let pad = 0xec; data.length < dataCodewords; pad ^= 0xec ^ 0x11) data.push(pad);

  // ④ かたまりに分け、それぞれの直し符号を作る
  const divisor = ecDivisor(spec.ecPerBlock);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let at = 0;
  for (const size of spec.blocks) {
    const block = data.slice(at, at + size);
    at += size;
    dataBlocks.push(block);
    ecBlocks.push(ecRemainder(block, divisor));
  }

  // ⑤ かたまりをまたいで1本ずつ拾う（インターリーブ）
  const result: number[] = [];
  const maxData = Math.max(...spec.blocks);
  for (let i = 0; i < maxData; i += 1) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]);
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

type Grid = { size: number; dark: boolean[][]; fixed: boolean[][] };

function emptyGrid(size: number): Grid {
  return {
    size,
    dark: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    fixed: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFixed(grid: Grid, x: number, y: number, dark: boolean) {
  grid.dark[y][x] = dark;
  grid.fixed[y][x] = true;
}

/** 目印・時計の列・書式の札の場所を置く */
function drawPatterns(grid: Grid, version: number) {
  const size = grid.size;

  // 時計の列（6行目・6列目）
  for (let i = 0; i < size; i += 1) {
    setFixed(grid, 6, i, i % 2 === 0);
    setFixed(grid, i, 6, i % 2 === 0);
  }

  // 3つの角の目印（7×7）と、そのまわりの空き（separator）
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFixed(grid, x, y, d !== 2 && d !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // そろえ用の目印（5×5）
  const coords = ALIGNMENT_COORDS[version];
  for (const cy of coords) {
    for (const cx of coords) {
      const isFinderCorner =
        (cx === 6 && cy === 6) ||
        (cx === 6 && cy === coords[coords.length - 1]) ||
        (cx === coords[coords.length - 1] && cy === 6);
      if (isFinderCorner) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFixed(grid, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // 書式の札の場所を先に取っておく（中身はあとで入れる）
  for (let i = 0; i <= 8; i += 1) {
    setFixed(grid, 8, i, false);
    setFixed(grid, i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    setFixed(grid, 8, size - 1 - i, false);
    setFixed(grid, size - 8 + i, 8, false);
  }
  // いつも黒い1ます
  setFixed(grid, 8, size - 8, true);
}

/** 書式の札（強さMと、使った隠し模様の番号）を入れる */
function drawFormatBits(grid: Grid, mask: number) {
  const size = grid.size;
  const data = (0b00 << 3) | mask; // 強さ M は 00
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = (((data << 10) | rem) ^ 0x5412) & 0x7fff;
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i <= 5; i += 1) setFixed(grid, 8, i, bit(i));
  setFixed(grid, 8, 7, bit(6));
  setFixed(grid, 8, 8, bit(7));
  setFixed(grid, 7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) setFixed(grid, 14 - i, 8, bit(i));

  for (let i = 0; i < 8; i += 1) setFixed(grid, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) setFixed(grid, 8, size - 15 + i, bit(i));
  setFixed(grid, 8, size - 8, true);
}

/** 符号の1本を、右下から縦2列ずつ折り返しながら置く */
function drawCodewords(grid: Grid, codewords: number[]) {
  const size = grid.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!grid.fixed[y][x] && i < codewords.length * 8) {
          grid.dark[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i += 1;
        }
      }
    }
  }
}

/** 隠し模様の当たり判定（8通り） */
function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(grid: Grid, mask: number) {
  for (let y = 0; y < grid.size; y += 1) {
    for (let x = 0; x < grid.size; x += 1) {
      if (!grid.fixed[y][x] && maskAt(mask, x, y)) grid.dark[y][x] = !grid.dark[y][x];
    }
  }
}

/** 1行（または1列）ぶんの読みにくさ（決めごと①と③） */
function lineScore(line: boolean[]): number {
  let score = 0;

  // ① 同じ色が5つ以上つづく → 3点＋（長さ−5）
  let run = 1;
  for (let i = 1; i <= line.length; i += 1) {
    if (i < line.length && line[i] === line[i - 1]) {
      run += 1;
      continue;
    }
    if (run >= 5) score += 3 + (run - 5);
    run = 1;
  }

  // ③ 角の目印とまちがえる並び（黒白黒黒黒白黒 の左右どちらかに白4つ）→ 40点
  //    行の外は白とみなすので、前後に白4つを足した文字列で数える。
  const text = `0000${line.map((d) => (d ? "1" : "0")).join("")}0000`;
  for (const pattern of ["00001011101", "10111010000"]) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(pattern, from);
      if (at < 0) break;
      score += 40;
      from = at + 1;
    }
  }

  return score;
}

/** 読みにくさの点数（低いほうを選ぶ。ISO/IEC 18004 の4つの決めごと） */
function penalty(grid: Grid): number {
  const size = grid.size;
  let score = 0;

  for (let y = 0; y < size; y += 1) score += lineScore(grid.dark[y]);
  for (let x = 0; x < size; x += 1) score += lineScore(grid.dark.map((row) => row[x]));

  // ② 2×2 の同じ色のかたまり → 3点
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const c = grid.dark[y][x];
      if (c === grid.dark[y][x + 1] && c === grid.dark[y + 1][x] && c === grid.dark[y + 1][x + 1]) {
        score += 3;
      }
    }
  }

  // ④ 黒の割合が半分から離れているほど加点
  let darkCount = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (grid.dark[y][x]) darkCount += 1;
  }
  const total = size * size;
  const percent = (darkCount * 100) / total;
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/** 白黒のます目（true＝黒）。まわりの余白は入っていない */
export function qrMatrix(text: string): boolean[][] {
  const bytes = toBytes(text);
  const version = chooseVersion(bytes.length);
  if (version === null) {
    throw new Error(`QRに入りません（${bytes.length}バイト）。第6型・強さMの上限を超えています`);
  }
  const codewords = buildCodewords(text, version);
  const size = 17 + version * 4;

  let best: Grid | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const grid = emptyGrid(size);
    drawPatterns(grid, version);
    drawCodewords(grid, codewords);
    drawFormatBits(grid, mask);
    applyMask(grid, mask);
    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = grid;
    }
  }
  return (best as Grid).dark;
}

/**
 * SVG の中身（黒いますの path 1本）にする。
 * 画像ファイルを持たないので、置き場も外への通信も要らない。
 */
export function qrSvgPath(matrix: boolean[][]): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix.length; x += 1) {
      if (matrix[y][x]) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return parts.join("");
}

/** まわりの余白（4ます）を含めた1辺のます数 */
export const QR_QUIET_ZONE = 4;

// ============================================================
// 正しさの確かめ用（tests/keiriQr.test.ts が読む）
// ============================================================
/**
 * 「ここは目印や札の場所で、本文は入らない」というます目。
 * 作った絵を読み戻して確かめるときに、本文のますだけを拾うために要る。
 */
export function qrFunctionMap(version: number): boolean[][] {
  const grid = emptyGrid(17 + version * 4);
  drawPatterns(grid, version);
  return grid.fixed;
}

/**
 * 本文の符号を置く順番（右下から縦2列ずつ折り返す並び）。
 * [x, y] の一覧で返す。読み戻すときも同じ順に拾えばよい。
 */
export function qrModulePositions(version: number): Array<[number, number]> {
  const fixed = qrFunctionMap(version);
  const size = 17 + version * 4;
  const out: Array<[number, number]> = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x]) out.push([x, y]);
      }
    }
  }
  return out;
}

/** 隠し模様の当たり判定（読み戻すときに、同じ模様で戻すために要る） */
export function qrMaskAt(mask: number, x: number, y: number): boolean {
  return maskAt(mask, x, y);
}

/** 型ごとの「かたまりの分け方」（読み戻すときに要る） */
export function qrBlockSpec(version: number): { ecPerBlock: number; blocks: number[] } {
  const spec = EC_M[version];
  return { ecPerBlock: spec.ecPerBlock, blocks: [...spec.blocks] };
}
