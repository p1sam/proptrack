/**
 * Categorical series colours in fixed order. Colour follows a series' position in the user's
 * selection, never its rank; more than four series are not drawn (fold into "Other" instead).
 */
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"] as const;
