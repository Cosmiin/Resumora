import assert from "node:assert/strict";
import test from "node:test";
import { photoRoute, digestPhoto } from "../src/photos/routes.ts";
import { inspectPhoto, PhotoError } from "../src/photos/format.ts";
import {
  cropRectangle,
  defaultPhotoCrop,
  isPhoto,
} from "../../../packages/contracts/src/editor/photo.ts";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  secret = "s".repeat(40);
const photo = {
  assetId: id,
  crop: { ...defaultPhotoCrop },
  shape: "circle",
  visible: true,
};
function fixture() {
  const bytes = new Uint8Array([255, 216, 255, 217]),
    calls = [];
  let asset = null,
    stored = null;
  return {
    calls,
    get asset() {
      return asset;
    },
    bytes,
    gateway: {
      async expirePhotos() {
        return [];
      },
      async reservePhoto(input, key) {
        assert.equal(key, secret);
        calls.push("reserve");
        if (asset && asset.sha256 !== input.sha256) throw { status: 409 };
        asset ??= { ...input, objectKey: "opaque/key", state: "reserved" };
        return asset;
      },
      async readyPhoto() {
        if (asset.state !== "reserved") throw { status: 404 };
        asset = { ...asset, state: "ready" };
        calls.push("ready");
        return asset;
      },
      async readPhoto(key) {
        if (key !== id || asset?.state !== "ready") throw { status: 404 };
        return { ...asset };
      },
      async deletePhoto(key, k, complete) {
        if (key !== id) throw { status: 404 };
        asset = { ...asset, state: complete ? "purged" : "purge_pending" };
        calls.push(asset.state);
        return asset;
      },
      async putPhoto(key, b) {
        stored = b;
        calls.push("put");
      },
      async getPhoto() {
        calls.push("get");
        return stored;
      },
      async purgePhoto() {
        calls.push("purge");
        stored = null;
      },
    },
    normalize: async () => ({
      bytes,
      width: 256,
      height: 256,
      mime: "image/jpeg",
    }),
  };
}
const req = (path = "", method = "POST", body = new Uint8Array([1])) =>
  new Request("http://local/v1/photos" + path, {
    method,
    headers: { "Content-Type": "image/jpeg", "X-Request-Id": id },
    ...(method === "GET" ? {} : { body }),
  });
test("crop keeps all framing within source across dimensions/zoom; masks do not alter source rectangle", () => {
  for (const [w, h] of [
    [1600, 800],
    [256, 1600],
    [1600, 1600],
  ])
    for (const zoom of [1, 1.15, 2, 3])
      for (const centerX of [0, 0.1, 0.5, 1])
        for (const centerY of [0, 0.5, 1]) {
          const r = cropRectangle(w, h, { version: 1, zoom, centerX, centerY });
          assert.ok(
            r.x >= 0 && r.y >= 0 && r.x + r.size <= w && r.y + r.size <= h,
          );
          assert.deepEqual(cropRectangle(w, h, r.crop), r);
        }
  assert.equal(
    isPhoto({ ...photo, crop: { ...photo.crop, zoom: Infinity } }),
    false,
  );
  assert.equal(
    isPhoto({ ...photo, crop: { ...photo.crop, centerX: NaN } }),
    false,
  );
  assert.equal(isPhoto({ ...photo, assetId: "http://image.invalid" }), false);
  assert.equal(isPhoto({ ...photo, arbitrary: 1 }), false);
});
test("owned normalized upload is replayable; content is checksum verified and cross-CV deletion fenced", async () => {
  const f = fixture();
  assert.equal(
    (await photoRoute(req(), f.gateway, secret, f.normalize)).status,
    200,
  );
  assert.deepEqual(f.calls, ["reserve", "put", "get", "ready"]);
  assert.equal(
    (await photoRoute(req(), f.gateway, secret, f.normalize)).status,
    200,
  );
  assert.equal(f.calls.filter((v) => v === "put").length, 1);
  const read = await photoRoute(
    req("/" + id, "GET"),
    f.gateway,
    secret,
    f.normalize,
  );
  assert.equal(read.status, 200);
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), f.bytes);
  assert.equal(read.headers.get("cache-control"), "private, no-store");
  assert.equal(
    (await photoRoute(req("/" + other, "GET"), f.gateway, secret, f.normalize))
      .status,
    404,
  );
  assert.equal(
    (await photoRoute(req("/" + id, "DELETE"), f.gateway, secret, f.normalize))
      .status,
    200,
  );
  assert.deepEqual(f.calls.slice(-3), ["purge_pending", "purge", "purged"]);
  assert.equal(
    (await photoRoute(req("/" + id, "GET"), f.gateway, secret, f.normalize))
      .status,
    404,
  );
  assert.equal(
    (await photoRoute(req(), f.gateway, secret, f.normalize)).status,
    404,
  );
});
test("disabled/foreign/invalid input, storage mismatch and deletion race never become successful bytes", async () => {
  const f = fixture();
  assert.equal(
    (await photoRoute(req(), f.gateway, undefined, f.normalize)).status,
    503,
  );
  assert.equal(f.calls.length, 0);
  const bad = new Request("http://local/v1/photos", {
    method: "POST",
    body: "x",
    headers: { "Content-Type": "text/plain", "X-Request-Id": id },
  });
  assert.equal(
    (await photoRoute(bad, f.gateway, secret, f.normalize)).status,
    415,
  );
  assert.equal(
    (
      await photoRoute(req(), f.gateway, secret, async () => {
        throw new PhotoError("invalidPhoto");
      })
    ).status,
    422,
  );
  f.gateway.getPhoto = async () => new Uint8Array([8]);
  assert.equal(
    (await photoRoute(req(), f.gateway, secret, f.normalize)).status,
    409,
  );
  assert.equal(f.asset.state, "reserved");
  const a = fixture();
  await photoRoute(req(), a.gateway, secret, a.normalize);
  let reads = 0;
  const original = a.gateway.readPhoto;
  a.gateway.readPhoto = async (key) => {
    if (++reads === 2) throw { status: 404 };
    return original(key);
  };
  assert.equal(
    (await photoRoute(req("/" + id, "GET"), a.gateway, secret, a.normalize))
      .status,
    404,
  );
});
test("header validation rejects bombs, non-images and animated input before native allocation", () => {
  assert.throws(
    () => inspectPhoto(new Uint8Array([255, 216, 255, 255, 255, 255])),
    (e) => e instanceof PhotoError && e.status === 422,
  );
  assert.throws(
    () => inspectPhoto(new Uint8Array(10485761)),
    (e) => e.code === "photoSize",
  );
  assert.throws(() => inspectPhoto(new TextEncoder().encode("<svg/>")));
  const png = new Uint8Array(45),
    v = new DataView(png.buffer);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  v.setUint32(8, 13);
  png.set(new TextEncoder().encode("IHDR"), 12);
  v.setUint32(16, 256);
  v.setUint32(20, 256);
  v.setUint32(33, 0);
  png.set(new TextEncoder().encode("acTL"), 37);
  assert.throws(
    () => inspectPhoto(png),
    (e) => e.code === "animatedPhoto",
  );
  v.setUint32(16, 9000);
  assert.throws(
    () => inspectPhoto(png),
    (e) => e.code === "photoDimensions",
  );
});

test("Supabase storage adapter retains user authorization and reconciles legacy duplicates without upsert", async () => {
  const { createDatabaseGateway } = await import("../src/db/supabase.ts");
  const calls = [];
  const gateway = createDatabaseGateway(
    {
      SUPABASE_URL: "https://synthetic.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
    },
    { user: { id }, accessToken: "synthetic-user-token" },
    async (url, init) => {
      calls.push({ url, init });
      return Response.json(
        { error: "Duplicate", message: "The resource already exists" },
        { status: 400 },
      );
    },
  );
  await gateway.putPhoto(id + "/" + other + ".jpg", new Uint8Array([1]));
  assert.equal(
    calls[0].init.headers.Authorization,
    "Bearer synthetic-user-token",
  );
  assert.equal(calls[0].init.headers["x-upsert"], "false");
  assert.equal(calls[0].init.redirect, "manual");
  await assert.rejects(() =>
    gateway.putPhoto("https://foreign.invalid/img", new Uint8Array([1])),
  );
  assert.equal(calls.length, 1);
});
