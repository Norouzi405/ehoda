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
}
