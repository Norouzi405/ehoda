/**
 * StorageService contract (portability rule 3.6). Abstracts binary object
 * storage so R2 can be swapped for S3 / local filesystem on a VPS without
 * touching any calling code.
 */
export interface StoragePutResult {
  key: string
}

export interface StorageService {
  put(key: string, data: ArrayBuffer | Uint8Array, contentType: string): Promise<StoragePutResult>
  /** Returns a time-limited signed URL, or null if the object does not exist. */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string | null>
  get(key: string): Promise<ArrayBuffer | null>
  delete(key: string): Promise<void>
  /**
   * Verifies a `(key, exp, sig)` triple produced by `getSignedUrl` (see
   * src/routes/files.ts, the only consumer). Adapters that have no native
   * signed-URL primitive (R2) implement real HMAC verification here;
   * adapters on platforms with native signed URLs (S3 presigned, etc.) can
   * return `true` unconditionally since the platform already enforces it.
   */
  verifySignedAccess(key: string, expiresAtMs: number, signature: string): Promise<boolean>
}
