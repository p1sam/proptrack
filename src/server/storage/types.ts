export interface StoredObject {
  size: number;
  stream: ReadableStream<Uint8Array>;
}

/**
 * Blob storage for user uploads (screenshots). Keys are opaque server-generated strings; drivers
 * never see user-controlled paths. Add an object-storage driver (S3, R2, Vercel Blob) by
 * implementing this interface and selecting it in `getStorage()`.
 */
export interface StorageDriver {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}
