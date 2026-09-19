import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_PROBE_ROW,
  classifyApplicationProbe,
  describeApplicationStore,
  probeApplicationStore,
  type ApplicationInsertClient,
} from "../lib/keiri/applicationStore";

/**
 * ここでいちばん守りたいこと（2026-09-19・kp103）
 *
 * ① 点検で **本物の申し込みの行を増やさない**こと。
 *    決まりは status='new' しか通さないので、点検の行は必ず別の値にする。
 *    ここが 'new' に戻ると、診断を開くたびに申し込みの控えがゴミで埋まる。
 * ② 郵便ポストの形（読めないのが正しい）を「不具合」と言わないこと。
 * ③ 「表が無い」「権利が無い」「決まりに断られた」を混ぜないこと（直し方が違う）。
 */

test("点検用の行は、決まりに必ず断られる中身になっている（本物の申し込みを増やさない）", () => {
  // status が 'new' だと決まりを通ってしまい、行が本当に入る
  assert.notEqual(APPLICATION_PROBE_ROW.status, "new");
  // source は 'form' のまま＝断られる理由が status ひとつに絞られる
  assert.equal(APPLICATION_PROBE_ROW.source, "form");
  assert.equal(APPLICATION_PROBE_ROW.tenant_id, null);
  // 作り物の連絡先を入れない（点検用と一目で分かる値だけ）
  assert.ok(APPLICATION_PROBE_ROW.shop_name.includes("diagnose"));
  assert.ok(APPLICATION_PROBE_ROW.email.endsWith(".invalid"));
  assert.equal(APPLICATION_PROBE_ROW.phone, null);
});

test("決まりに断られたら「残ります」と言い切る（郵便ポストの形は正しい状態）", () => {
  const r = describeApplicationStore(
    classifyApplicationProbe({
      code: "42501",
      message: 'new row violates row-level security policy for table "keiri_applications"',
    }),
    false,
  );
  assert.equal(r.ok, true);
  assert.equal(r.readable, false);
  assert.ok(r.note.includes("残ります"));
});

test("表が無い／権利が無い／決まりに断られた を言い分ける（直し方が違うため）", () => {
  const noTable = classifyApplicationProbe({ code: "42P01", message: 'relation does not exist' });
  const noGrant = classifyApplicationProbe({
    code: "42501",
    message: "permission denied for table keiri_applications",
  });
  const rejected = classifyApplicationProbe({
    code: "42501",
    message: "new row violates row-level security policy",
  });
  assert.equal(noTable.outcome, "no_table");
  assert.equal(noGrant.outcome, "no_grant");
  assert.equal(rejected.outcome, "rejected_by_policy");

  const a = describeApplicationStore(noTable, false);
  const b = describeApplicationStore(noGrant, false);
  assert.equal(a.ok, false);
  assert.equal(b.ok, false);
  assert.notEqual(a.note, b.note);
  assert.ok(a.note.includes("keiri_applications.sql"));
  assert.ok(b.note.includes("insert_only.sql"));
});

test("PostgREST の言い方（表が見つからない）でも「表が無い」と読む", () => {
  const r = classifyApplicationProbe({
    code: "PGRST205",
    message: "Could not find the table 'public.keiri_applications' in the schema cache",
  });
  assert.equal(r.outcome, "no_table");
});

test("断られずに入ってしまったら、正直に不具合として出す（決まりが効いていない）", () => {
  const r = describeApplicationStore(classifyApplicationProbe(null), false);
  assert.equal(r.ok, false);
  assert.ok(r.note.includes("__diagnose__"));
  assert.ok(r.note.includes("insert_only.sql"));
});

test("理由が分からないときは ok にしない（分からないことを大丈夫と言わない）", () => {
  const r = describeApplicationStore(
    classifyApplicationProbe({ code: "08006", message: "connection failure" }),
    false,
  );
  assert.equal(r.ok, false);
  assert.ok(r.note.includes("確かめられませんでした"));
});

test("1行ずつ読めるとき（鍵が生きているとき）は、そのまま「記録できます」", () => {
  const r = describeApplicationStore({ outcome: "unknown", detail: "" }, true);
  assert.equal(r.ok, true);
  assert.equal(r.readable, true);
});

test("点検は keiri_applications だけを触り、手羽屋の表には触らない", async () => {
  const touched: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const db: ApplicationInsertClient = {
    from(table) {
      touched.push(table);
      return {
        insert(row) {
          rows.push(row);
          return Promise.resolve({
            error: { code: "42501", message: "new row violates row-level security policy" },
          });
        },
      };
    },
  };
  const probe = await probeApplicationStore(db);
  assert.equal(probe.outcome, "rejected_by_policy");
  assert.deepEqual(touched, ["keiri_applications"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, APPLICATION_PROBE_ROW.status);
});

test("通信に失敗しても、例外を外に出さない（診断そのものが落ちない）", async () => {
  const db: ApplicationInsertClient = {
    from() {
      throw new Error("network down");
    },
  };
  const probe = await probeApplicationStore(db);
  assert.equal(probe.outcome, "unknown");
  assert.ok(probe.detail.includes("network down"));
});
