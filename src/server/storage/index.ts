import "server-only";
import { randomUUID } from "node:crypto";
import { LocalDiskDriver } from "./local";
import { IMAGE_EXTENSION, type ImageMime } from "./sniff";
import type { StorageDriver } from "./types";

export type { StorageDriver, StoredObject } from "./types";
export { sniffImageType, type ImageMime } from "./sniff";

/**
 * Storage driver selection. Only the local-disk driver exists today:
 *
 *   STORAGE_DRIVER=local (default)  → files under UPLOAD_DIR (default ./.uploads, outside public/)
 *
 * Local disk is fine for a single long-lived server, but EPHEMERAL on Vercel/serverless: files
 * vanish on redeploy and are not shared across instances. For production on such hosts, add an
 * S3 / R2 / Vercel Blob driver implementing `StorageDriver` and select it here.
 */
let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!driver) {
    const kind = process.env.STORAGE_DRIVER ?? "local";
    if (kind !== "local") throw new Error(`Unsupported STORAGE_DRIVER "${kind}" — only "local" is implemented`);
    driver = new LocalDiskDriver(process.env.UPLOAD_DIR || "./.uploads");
  }
  return driver;
}

/** Random, unguessable key for a new screenshot. */
export function newScreenshotKey(mime: ImageMime): string {
  return `screenshots/${randomUUID()}.${IMAGE_EXTENSION[mime]}`;
}

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
