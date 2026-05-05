/**
 * Vercel Blob wrapper for receipt storage (Phase Selections feature).
 *
 * Private store: uploaded files are never publicly accessible by URL — every
 * read goes through our server, which checks auth and pipes the bytes.
 *
 * SDK note (v2.3.3): @vercel/blob does not expose a `getSignedReadUrl()` helper
 * or a `downloadUrl` with a TTL. The SDK's contract for private reads is
 * `get(pathname, { access: 'private' })`, which returns a streaming response.
 * The Stage 4 read endpoint will call `streamPrivateBlob` and pipe the result
 * back to the client. The "signed URL" the spec describes is therefore an
 * authenticated server endpoint, not a signed CDN URL with an expiry — same
 * privacy guarantees, different mechanism.
 */

import { put, del, get } from "@vercel/blob";
import type { GetBlobResult, PutBlobResult } from "@vercel/blob";

export const BLOB_RECEIPT_CONFIG = {
  allowedContentTypes: ["image/jpeg", "image/png", "application/pdf"] as const,
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB
} as const;

/**
 * Server-side upload (used by the Stage 1 smoke test and any admin-side
 * upload flow). Stage 4 attendee uploads go through `@vercel/blob/client`'s
 * `handleUpload` instead, which issues a one-shot client token.
 *
 * `addRandomSuffix: true` appends entropy to the pathname so concurrent
 * uploads to the same logical path don't collide.
 */
export async function uploadPrivateBlob(
  pathname: string,
  body: Buffer | Blob | string | ReadableStream,
  options: { contentType?: string } = {}
): Promise<PutBlobResult> {
  return put(pathname, body, {
    access: "private",
    contentType: options.contentType,
    addRandomSuffix: true,
  });
}

/**
 * Fetches a private blob's bytes via the SDK. Caller is responsible for
 * authenticating the request before invoking this and for piping the stream
 * back as the HTTP response.
 *
 * Throws if the blob does not exist.
 */
export async function streamPrivateBlob(
  blobPath: string
): Promise<Extract<GetBlobResult, { statusCode: 200 }>> {
  const result = await get(blobPath, { access: "private" });
  if (!result) {
    throw new Error(`Blob not found: ${blobPath}`);
  }
  if (result.statusCode !== 200) {
    // 304 should not occur because we never pass `ifNoneMatch`.
    throw new Error(`Unexpected blob status: ${result.statusCode}`);
  }
  return result;
}

/**
 * Deletes a private blob. Idempotent — succeeds silently if the blob is
 * already gone (the SDK does not throw on missing paths).
 */
export async function deleteBlob(blobPath: string): Promise<void> {
  await del(blobPath);
}
