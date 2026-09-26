/** Convert Prisma Decimal (or anything with toString) to a JS number; null stays null. */
export function num(value: { toString(): string } | number | null | undefined): number;
export function num<T extends null | undefined>(value: T): null;
export function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : null;
}

export function numOrNull(value: { toString(): string } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return num(value);
}
