import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sniffImageType } from "@/server/storage/sniff";
import { LocalDiskDriver, assertValidKey } from "@/server/storage/local";

const bytes = (...b: (number | string)[]) =>
  new Uint8Array(b.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("sniffImageType", () => {
  it("detects PNG", () => {
    expect(sniffImageType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13))).toBe("image/png");
  });
  it("detects JPEG", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, "JFIF"))).toBe("image/jpeg");
  });
  it("detects GIF87a and GIF89a", () => {
    expect(sniffImageType(bytes("GIF87a", 1, 0))).toBe("image/gif");
    expect(sniffImageType(bytes("GIF89a", 1, 0))).toBe("image/gif");
  });
  it("detects WebP (RIFF….WEBP)", () => {
    expect(sniffImageType(bytes("RIFF", 0x24, 0, 0, 0, "WEBP", "VP8 "))).toBe("image/webp");
  });
  it("rejects RIFF containers that are not WebP (e.g. WAV/AVI)", () => {
    expect(sniffImageType(bytes("RIFF", 0x24, 0, 0, 0, "WAVE", "fmt "))).toBeNull();
  });
  it("rejects SVG, HTML and text even when named like an image", () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(bytes("<!DOCTYPE html><script>"))).toBeNull();
    expect(sniffImageType(bytes("hello"))).toBeNull();
  });
  it("rejects truncated signatures and empty input", () => {
    expect(sniffImageType(new Uint8Array())).toBeNull();
    expect(sniffImageType(bytes(0x89, "PN"))).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WEB"))).toBeNull();
  });
  it("rejects a PDF", () => {
    expect(sniffImageType(bytes("%PDF-1.7"))).toBeNull();
  });
});

describe("storage keys", () => {
  it("accepts generated keys", () => {
    expect(() => assertValidKey("screenshots/2f1c0a3e-8f0b-4b7a-9d7e-1e2f3a4b5c6d.png")).not.toThrow();
  });
  it("rejects traversal and absolute paths", () => {
    for (const k of ["../etc/passwd", "screenshots/../../x", "/etc/passwd", "a//b", "a\\b", "", "screenshots/.hidden"]) {
      expect(() => assertValidKey(k), k).toThrow();
    }
  });
});

describe("LocalDiskDriver", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pt-storage-"));
  const driver = new LocalDiskDriver(root);
  afterAll(() => rm(root, { recursive: true, force: true }));

  it("puts, gets and deletes an object", async () => {
    const data = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3);
    await driver.put("screenshots/a.png", data);
    const obj = await driver.get("screenshots/a.png");
    expect(obj?.size).toBe(data.length);
    const read = new Uint8Array(await new Response(obj!.stream).arrayBuffer());
    expect([...read]).toEqual([...data]);
    await driver.delete("screenshots/a.png");
    expect(await driver.get("screenshots/a.png")).toBeNull();
    expect(await readdir(path.join(root, "screenshots"))).toEqual([]);
  });

  it("never overwrites an existing key", async () => {
    await driver.put("screenshots/b.png", bytes(1));
    await expect(driver.put("screenshots/b.png", bytes(2))).rejects.toThrow();
  });

  it("returns null for missing keys and ignores deleting them", async () => {
    expect(await driver.get("screenshots/missing.png")).toBeNull();
    await expect(driver.delete("screenshots/missing.png")).resolves.toBeUndefined();
  });

  it("refuses keys that escape the root", async () => {
    await expect(driver.get("../outside.png")).rejects.toThrow("Invalid storage key");
  });
});
