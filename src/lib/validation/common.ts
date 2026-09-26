import { z } from "zod";

/** Optional decimal from a form: "" → null, validates finite numbers. */
export const optionalNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Must be a number" });
      return z.NEVER;
    }
    return n;
  });

export const requiredNumber = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (v === "" || !Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: "Required number" });
    return z.NEVER;
  }
  return n;
});

export const positiveNumber = requiredNumber.refine((n) => n > 0, "Must be greater than 0");
export const nonNegativeOptional = optionalNumber.refine((n) => n === null || n >= 0, "Cannot be negative");
export const pctOptional = optionalNumber.refine((n) => n === null || (n >= 0 && n <= 100), "Must be between 0 and 100");

export const optionalText = (max = 2000) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null));

export const isoDateTime = z
  .union([z.string(), z.date()])
  .transform((v, ctx) => {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

export const optionalDateTime = z
  .union([z.string(), z.date(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

export const currency = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code")
  .transform((s) => s.toUpperCase());

export const id = z.string().min(1).max(64);
