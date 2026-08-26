import type { StorageService, StoragePutResult } from './storage-service.interface'

/**
 * Cloudflare R2 implementation of StorageService. On VPS migration, replace
 * with an S3StorageService or LocalFilesystemStorageService implementing
 * the same interface — no caller changes required (portability rule 3.6).
 *
 * NOTE: R2 has no native "signed URL with TTL" primitive without an
 * external worker route; here we implement it via a short-lived signed
 * token embedded in our own `/files/:key` route (see src/routes/files.ts),
 * validated against the `expiresAt` stored in pdf_exports.
 */
export class R2StorageService implements StorageService {
  constructor(private readonly bucket: R2Bucket, private readonly signSecret: string) {}

  async put(key: string, data: ArrayBuffer | Uint8Array, contentType: string): Promise<StoragePutResult> {
    await this.bucket.put(key, data, { httpMetadata: { contentType } })
    return { key }
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const obj = await this.bucket.get(key)
    if (!obj) return null
    return await obj.arrayBuffer()
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key)
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    const exists = await this.bucket.head(key)
    if (!exists) return null
    const expiresAt = Date.now() + expiresInSeconds * 1000
    const token = await this.sign(key, expiresAt)
    return `/files/${encodeURIComponent(key)}?exp=${expiresAt}&sig=${token}`
  }

  private async sign(key: string, expiresAt: number): Promise<string> {
    const enc = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
      'raw', enc.encode(this.signSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`${key}:${expiresAt}`))
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
}
