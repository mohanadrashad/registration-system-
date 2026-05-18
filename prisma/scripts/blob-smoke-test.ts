/**
 * Throwaway Stage 1 smoke test for the Vercel Blob SDK.
 *
 * Confirms that the three flows the Phase Selections feature relies on —
 * upload, private read, delete — work end-to-end with @vercel/blob v2.x and
 * the BLOB_READ_WRITE_TOKEN in .env.local. Run via:
 *
 *   npx tsx prisma/scripts/blob-smoke-test.ts
 *
 * Documents in stdout any deltas between the spec's assumed SDK shape and
 * what the installed version actually exposes.
 */

import { config as loadEnv } from "dotenv";
import { put, get, del } from "@vercel/blob";

loadEnv({ path: ".env.local" });

const TEST_PATH = `smoke-tests/stage1-${Date.now()}.txt`;
const TEST_BODY = `phase-selections smoke test ${new Date().toISOString()}`;

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Run `vercel env pull` or paste the token into .env.local."
    );
  }

  console.log("[1/3] put() — uploading private blob…");
  const uploaded = await put(TEST_PATH, TEST_BODY, {
    access: "private",
    contentType: "text/plain",
    addRandomSuffix: true,
  });
  console.log("       pathname:", uploaded.pathname);
  console.log("       url     :", uploaded.url);
  console.log("       returned shape keys:", Object.keys(uploaded).join(", "));

  // Confirm the upload is NOT publicly fetchable via its raw URL — that's the
  // point of `access: 'private'`. We expect a non-2xx (typically 401/403).
  const rawCheck = await fetch(uploaded.url);
  console.log(
    `       raw URL fetch (should NOT be 200): status=${rawCheck.status}`
  );
  if (rawCheck.ok) {
    console.warn(
      "       ⚠ private blob is publicly fetchable — store may not be Private!"
    );
  }

  console.log("\n[2/3] get(pathname, { access: 'private' }) — reading…");
  const read = await get(uploaded.pathname, { access: "private" });
  if (!read) {
    throw new Error("get() returned null");
  }
  if (read.statusCode !== 200) {
    throw new Error(`unexpected statusCode ${read.statusCode}`);
  }
  const buf = await new Response(read.stream).text();
  console.log("       contentType:", read.blob.contentType);
  console.log("       size       :", read.blob.size);
  console.log("       body match :", buf === TEST_BODY);
  if (buf !== TEST_BODY) {
    throw new Error(`body mismatch — got: ${buf}`);
  }

  console.log("\n[3/3] del(pathname) — deleting…");
  await del(uploaded.pathname);
  // Confirm the blob is gone.
  const afterDelete = await get(uploaded.pathname, {
    access: "private",
  }).catch((err: unknown) => err);
  console.log(
    "       post-delete get():",
    afterDelete === null
      ? "null (gone)"
      : afterDelete instanceof Error
        ? `threw ${afterDelete.constructor.name}: ${afterDelete.message}`
        : `unexpected: ${JSON.stringify(afterDelete)}`
  );

  console.log("\n✅ Smoke test passed.");
  console.log("\nDeltas vs. spec assumptions (Phase Selections spec, Stage 4):");
  console.log(
    "  • Spec assumed `head().downloadUrl` would be a signed URL with"
  );
  console.log(
    "    `downloadUrlExpiresAt`. v2.3.3 does not expose this — `head()` and"
  );
  console.log(
    "    `put()` return a `downloadUrl` that just appends `?download=1` and is"
  );
  console.log("    not signed.");
  console.log(
    "  • The SDK's idiomatic flow for private reads is `get(path, { access:"
  );
  console.log(
    "    'private' })` which returns a streaming body. Our blob wrapper"
  );
  console.log(
    "    (src/lib/blob.ts) exposes `streamPrivateBlob()` and the Stage 4"
  );
  console.log(
    "    signed-URL endpoints will pipe the stream back through Next.js"
  );
  console.log(
    "    instead of returning a CDN URL with a TTL. Privacy guarantees are"
  );
  console.log(
    "    equivalent (auth check + private storage); the URL leaked-link"
  );
  console.log(
    "    threat model becomes 'leaked auth cookie' instead of 'leaked signed"
  );
  console.log("    URL'.");
}

main().catch((err) => {
  console.error("\n❌ Smoke test failed:", err);
  process.exit(1);
});
