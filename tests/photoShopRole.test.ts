import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MUTA_SHOP, photoShopByStaffHash } from "../lib/photoShop";
import {
  PHOTO_SHOP_ROLE_KEY,
  canSeeShopMoney,
  canViewManual,
  readPhotoShopRole,
  writePhotoShopRole,
} from "../lib/photoShopRole";

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

test("印が無い端末は店主扱い。スタッフの印を書くとスタッフ、店主に戻すと印が消える", () => {
  const s = memStore();
  assert.equal(readPhotoShopRole(s), "owner");
  writePhotoShopRole("staff", s);
  assert.equal(readPhotoShopRole(s), "staff");
  writePhotoShopRole("owner", s);
  assert.equal(s.getItem(PHOTO_SHOP_ROLE_KEY), null);
  assert.equal(readPhotoShopRole(s), "owner");
});

test("スタッフにはお金の数字を出さない。店主には出す", () => {
  assert.equal(canSeeShopMoney("staff"), false);
  assert.equal(canSeeShopMoney("owner"), true);
});

test("マニュアルは牟田町店の端末とじゅんの端末だけ。印の無い手羽屋の端末・よその店には出さない", () => {
  assert.equal(canViewManual({ scope: MUTA_SHOP.tenantId, ownerDevice: false }), true);
  assert.equal(canViewManual({ scope: null, ownerDevice: true }), true);
  assert.equal(canViewManual({ scope: null, ownerDevice: false }), false);
  assert.equal(canViewManual({ scope: "11111111-2222-3333-4444-555555555555", ownerDevice: false }), false);
});

test("スタッフの合言葉の戻せない形から牟田町店が引ける。違う値・変な値は引けない", () => {
  assert.ok(MUTA_SHOP.staffPasscodeHash);
  assert.equal(photoShopByStaffHash(MUTA_SHOP.staffPasscodeHash!)?.tenantId, MUTA_SHOP.tenantId);
  assert.equal(photoShopByStaffHash(createHash("sha256").update("ちがう").digest("hex")), null);
  assert.equal(photoShopByStaffHash(""), null);
  assert.equal(photoShopByStaffHash("abc"), null);
});

test("同じ合言葉のお店が2軒あったら、どちらにも入れない", () => {
  const h = MUTA_SHOP.staffPasscodeHash!;
  assert.equal(photoShopByStaffHash(h, [MUTA_SHOP, { ...MUTA_SHOP, tenantId: "x" }]), null);
});
