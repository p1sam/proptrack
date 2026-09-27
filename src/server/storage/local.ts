import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { StorageDriver, StoredObject } from "./types";

/** Keys are opaque, generated server-side; this pattern also rules out traversal (no "..", no leading "/"). */
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*(\/[A-Za-z0-9][A-Za-z0-9_.-]*)*$/;

export function assertValidKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.length > 200) throw new Error("Invalid storage key");
}

/**
 * Local-disk driver. Files live under `root` (UPLOAD_DIR), which must be outside `public/` so
 * nothing is served without the authorised route handler.
 *
 * NOTE: on Vercel and other serverless hosts the filesystem is ephemeral and not shared between
 * instances — uploads would disappear. Use an object-storage driver (S3 / R2 / Vercel Blob) there.
 */
export class LocalDiskDriver implements StorageDriver {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string) {
    assertValidKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  // contentType is not needed on disk: the MIME type is stored on the TradeScreenshot row.
  async put(key: string, data: Uint8Array): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    // "wx": never overwrite an existing object (keys are random UUIDs).
    await writeFile(full, data, { flag: "wx", mode: 0o600 });
  }

  async get(key: string): Promise<StoredObject | null> {
    const full = this.resolve(key);
    try {
      const s = await stat(full);
      if (!s.isFile()) return null;
      return { size: s.size, stream: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array> };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
