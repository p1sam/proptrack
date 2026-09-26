# PropTrack architecture

PropTrack is a trading journal and prop-firm operating system: challenge → pass → funded →
payouts, with a rule engine, analytics and behavioural insights computed from the user's own trades.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Radix base), lucide icons, Recharts |
| Data | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`), migrations in `prisma/migrations` |
| Auth | Better Auth (email + password, DB sessions, Postgres-backed rate limiting) |
| Validation | Zod 4 — shared schemas in `src/lib/validation` |
| Tests | Vitest (`tests/**`) |
| Local DB | PGlite (embedded Postgres) served over TCP by `npm run db:start` |

Better Auth is used instead of Auth.js because Auth.js v5 is still in beta and its credentials
provider does not manage password storage or DB sessions; Better Auth does both, plus rate
limiting, with a Prisma adapter.

## Directory map

```
prisma/schema.prisma        relational schema (see comments at the top for conventions)
prisma/seed.ts              deterministic demo data (npm run db:seed)
src/lib/calc/*              PURE financial calculations — no I/O, fully unit-tested
  money.ts                  exact money arithmetic (scaled integers / decimal.js)
  trade.ts                  P&L incl. partial exits, risk, R, planned R:R, MFE/MAE
  stats.ts                  win rate, PF, expectancy, streaks, Sharpe/Sortino, breakdownBy
  drawdown.ts equity.ts     drawdown, equity/daily/monthly series, distributions
  account.ts                PROP RULE ENGINE (targets, daily loss, trailing DD, consistency, payouts)
  personal-rules.ts         trader's own rules + hard limits
  behavior.ts               sequences after losses, sizing, overtrading, tags, emotions, insights
  economics.ts fx.ts        fees/payouts ROI, currency conversion with user rates
  copies.ts sessions.ts time.ts
src/lib/validation/*        zod schemas shared by forms (client) and actions (server)
src/lib/filters.ts          URL-encoded trade filter model
src/lib/format.ts labels.ts display helpers (money, %, R, dates, enum labels)
src/server/db.ts            Prisma client
src/server/auth.ts session.ts   Better Auth + requireUser()
src/server/action.ts        createAction(schema, handler) — auth + zod + error mapping
src/server/actions/*        "use server" mutations (every one scoped by user.id)
src/server/queries/*        read models (every one takes userId first)
  accounts.ts               AccountSummary (live rule state + economics), portfolio
  dataset.ts                analytics dataset: filtered, currency-converted, copy-collapsed trades
  analytics.ts              computeAnalytics / computeBehavior bundles
  trade-where.ts            filters → Prisma where (always starts with userId)
src/server/services/*
  ledger.ts                 balance ledger + AccountState from DB rows
  rebuild.ts                rebuildAccount(): recompute derived trade columns, DailyPerformance, RuleViolations
src/components/ui/*         shadcn primitives (generated)
src/components/app/*        shell, stat cards, pnl formatting, meters, badges
src/components/charts/*     Recharts wrappers (client)
src/components/filters/*    FilterBar (URL-bound)
src/app/(auth)/*            login / register
src/app/(app)/*             authenticated pages
```

## Data flow

1. **Writes** go through server actions built with `createAction(schema, handler)`. Handlers
   verify ownership of every referenced id (`findFirst({ where: { id, userId } })`), write
   source records, then call `rebuildAccount(userId, accountId)` for each affected account.
2. **rebuildAccount** is deterministic and idempotent: it recomputes each trade's P&L, risk, R,
   risk %, session, trading day and weekday; replays the account ledger through the rule engine;
   and replaces the account's `DailyPerformance` and `RuleViolation` rows.
3. **Reads** use `src/server/queries/*`. Live account state (balance, target progress, drawdown
   remaining) is computed on read from the ledger, so it is always consistent with the trades.
4. **Analytics** always start from `loadDataset(userId, filters)` → `computeAnalytics` /
   `computeBehavior`. One pipeline means the dashboard, analytics, reports and a future AI layer
   all agree on every number.

## Financial conventions

- Money is stored as `Decimal(18,4)` and arithmetic uses exact scaled integers / decimal.js
  (`src/lib/calc/money.ts`). Never sum raw floats for money.
- Net P&L = gross − commission (positive cost) + swap (signed).
- A platform-reported gross P&L overrides price-based calculation.
- `pointValue` = account-currency value of a 1.0 price move per unit of quantity, snapshotted on
  the trade.
- R = net P&L / initial risk; initial risk = |entry − stop| × qty × pointValue (or an explicit
  override). Trades without a valid stop have no R and are excluded from R averages (sample
  sizes are shown).
- Win rate excludes break-even trades (|net| ≤ user tolerance) from the denominator.
- Balances and all prop rules use **closed-trade balance**; floating equity is not known to the
  journal. The UI says so wherever limits are shown.
- Payout withdrawals debit the account balance (when `deductFromBalance`) at the request date,
  and are not counted as trading drawdown.
- Multi-account copies: one `Trade` per account linked by `groupId`. Money sums every copy;
  trade-level statistics collapse a group into one idea (`collapseCopies`) unless the view is a
  single account.
- Currency: portfolio views convert to the user's default currency with user-maintained rates;
  anything without a rate is excluded and disclosed, never silently summed.

## Security

- Every query and mutation is scoped by `userId` from `requireUser()` (server-side session check);
  `proxy.ts` only does an optimistic redirect.
- Inputs are validated with zod; Prisma parameterises all SQL (raw SQL uses tagged templates).
- Auth endpoints and import/upload actions are rate limited in Postgres.
- Screenshots are stored outside `public/` and streamed through an authorised route handler after
  checking ownership, MIME type (sniffed from bytes) and size.

## Extension points

- **Integrations** (`src/lib/import/adapters`): every importer implements `TradeSourceAdapter`.
  CSV is implemented; MT4/MT5, cTrader, TradingView, IBKR, DXtrade and Match-Trader are listed in
  the registry as "coming later" and have an `IntegrationConnection` table ready for credentials.
- **AI**: `loadDataset` + `computeAnalytics`/`computeBehavior` + trade journals are the grounded
  context a future AI layer would use. No AI feature is implemented.
