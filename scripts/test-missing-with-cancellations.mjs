// reportMissingLocations.ts のロジックを抜き出して、中止記録あり/なしの挙動を確認するユニットテスト。
// 実DBには触らず、関数のロジックだけを検証する。

function normalizeLocationName(name) {
  if (!name) return "";
  return name
    .replace(/\s+/g, "")
    .replace(/　/g, "")
    .replace(/店$/, "")
    .toLowerCase();
}

function runMissing({ shifts, reports, cancellations }) {
  if (!shifts || shifts.length === 0) {
    return { missing: [], total: 0, submitted: 0, cancelled: 0 };
  }

  const reportedLocs = new Set(
    (reports || [])
      .map((r) => normalizeLocationName(r.location || ""))
      .filter((s) => s.length > 0),
  );

  const cancelledLocs = new Set();
  const cancelledLocStaff = new Set();
  for (const c of cancellations || []) {
    const normLoc = normalizeLocationName(c.location || "");
    if (!normLoc) continue;
    cancelledLocs.add(normLoc);
    const normStaff = (c.staff_name_raw || "").trim();
    cancelledLocStaff.add(`${normLoc}|${normStaff}`);
  }

  const missing = [];
  let submitted = 0;
  let cancelled = 0;

  for (const s of shifts) {
    const locName = s.locations?.name || "不明";
    const normalized = normalizeLocationName(locName);

    if (reportedLocs.has(normalized)) {
      submitted++;
      continue;
    }

    const staffParts = (s.staff_name || "")
      .split("&")
      .map((n) => n.trim())
      .filter(Boolean);

    const matchesCancellation =
      staffParts.length === 0
        ? cancelledLocs.has(normalized)
        : staffParts.some((p) =>
            cancelledLocStaff.has(`${normalized}|${p}`),
          );

    if (matchesCancellation) {
      cancelled++;
      continue;
    }

    missing.push({
      location_name: locName,
      staff_hint: s.staff_name || "未定",
    });
  }

  return { missing, total: shifts.length, submitted, cancelled };
}

// ========== テストケース ==========
const testShifts = [
  { staff_name: "じゅん", locations: { name: "ながやま 三股店" } },
  { staff_name: "かずき", locations: { name: "マンガ倉庫" } },
  { staff_name: "なぎさ&応援A", locations: { name: "PASIO高城店" } },
];

const cases = [
  {
    name: "ケース1: 全員未提出・中止記録なし → missing=3, cancelled=0",
    inputs: { shifts: testShifts, reports: [], cancellations: [] },
    expected: { missing: 3, submitted: 0, cancelled: 0, total: 3 },
  },
  {
    name: "ケース2: マンガ倉庫だけ提出 → missing=2, submitted=1",
    inputs: {
      shifts: testShifts,
      reports: [{ location: "マンガ倉庫" }],
      cancellations: [],
    },
    expected: { missing: 2, submitted: 1, cancelled: 0, total: 3 },
  },
  {
    name: "ケース3: 三股店をかずきが中止登録（しかしshift担当はじゅん）→ 一致せずmissingのまま",
    inputs: {
      shifts: testShifts,
      reports: [],
      cancellations: [
        {
          business_date: "2026-05-01",
          location: "ながやま 三股店",
          staff_name_raw: "かずき",
        },
      ],
    },
    expected: { missing: 3, submitted: 0, cancelled: 0, total: 3 },
  },
  {
    name: "ケース4: 三股店をじゅんが中止登録 → cancelled=1, missing=2",
    inputs: {
      shifts: testShifts,
      reports: [],
      cancellations: [
        {
          business_date: "2026-05-01",
          location: "ながやま 三股店",
          staff_name_raw: "じゅん",
        },
      ],
    },
    expected: { missing: 2, submitted: 0, cancelled: 1, total: 3 },
  },
  {
    name: "ケース5: 連名shift（なぎさ&応援A）でなぎさが中止登録 → 連名でも一致しcancelled=1",
    inputs: {
      shifts: testShifts,
      reports: [],
      cancellations: [
        {
          business_date: "2026-05-01",
          location: "PASIO高城店",
          staff_name_raw: "なぎさ",
        },
      ],
    },
    expected: { missing: 2, submitted: 0, cancelled: 1, total: 3 },
  },
  {
    name: "ケース6: 1件提出+1件中止+1件未提出 → 提出済1/中止1/未提出1",
    inputs: {
      shifts: testShifts,
      reports: [{ location: "マンガ倉庫" }],
      cancellations: [
        {
          business_date: "2026-05-01",
          location: "ながやま 三股店",
          staff_name_raw: "じゅん",
        },
      ],
    },
    expected: { missing: 1, submitted: 1, cancelled: 1, total: 3 },
  },
  {
    name: "ケース7: 表記揺れ「ながやま三股」（スペースなし）でも一致",
    inputs: {
      shifts: testShifts,
      reports: [],
      cancellations: [
        {
          business_date: "2026-05-01",
          location: "ながやま三股", // 末尾「店」も無し
          staff_name_raw: "じゅん",
        },
      ],
    },
    expected: { missing: 2, submitted: 0, cancelled: 1, total: 3 },
  },
];

let passed = 0;
let failed = 0;
for (const c of cases) {
  const r = runMissing(c.inputs);
  const got = {
    missing: r.missing.length,
    submitted: r.submitted,
    cancelled: r.cancelled,
    total: r.total,
  };
  let ok = true;
  for (const [k, v] of Object.entries(c.expected)) {
    if (got[k] !== v) ok = false;
  }
  console.log(
    `${ok ? "✓" : "✗"} ${c.name}\n   期待=${JSON.stringify(c.expected)}\n   実際=${JSON.stringify(got)}`,
  );
  if (!ok && r.missing.length > 0) {
    console.log(
      "   missingの中身:",
      r.missing.map((m) => `${m.location_name}(${m.staff_hint})`).join(", "),
    );
  }
  if (ok) passed++;
  else failed++;
}

console.log(`\n結果: ${passed}件 PASS / ${failed}件 FAIL`);
process.exit(failed === 0 ? 0 : 1);
