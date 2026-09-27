/** Labels for rule enums (plain module so server and client components can both import it). */
export const DRAWDOWN_TYPE_LABEL: Record<"STATIC" | "TRAILING_EOD" | "TRAILING_BALANCE", string> = {
  STATIC: "Static",
  TRAILING_EOD: "Trailing (end of day)",
  TRAILING_BALANCE: "Trailing (closed balance)",
};

export const DAILY_BASIS_LABEL: Record<"STARTING_BALANCE" | "DAY_START_BALANCE", string> = {
  STARTING_BALANCE: "% of starting balance",
  DAY_START_BALANCE: "% of day-start balance",
};
