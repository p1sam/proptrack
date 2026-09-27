# PropTrack

A trading journal and prop-firm operating system. Track every account from **challenge → pass →
funded → payouts**, with an automatic rule engine (profit targets, daily loss, static/trailing
drawdown, consistency, payout eligibility), trade journaling with psychology tracking, and
analytics computed only from your own data.

> Demo data is fictional. Nothing here is financial advice.

## Quick start (local)

Requirements: Node 20.9+ (tested on Node 26). No Docker or system Postgres needed — local
development runs real PostgreSQL 17 from the `embedded-postgres` npm package.

```bash
npm install
cp .env.example .env      # then set BETTER_AUTH_SECRET (command in the file)
npm run db:start          # terminal 1 — Postgres 17 on 127.0.0.1:51216 (data in ./.postgres)
npm run db:migrate        # terminal 2 — apply migrations
npm run db:seed           # optional demo data
npm run dev               # http://localhost:3000
```

Demo login (after seeding): `demo@proptrack.test` / `demo-password-123`.

The seed creates 3 fictional prop firms, 8 accounts across a full lifecycle (2-step challenge
passed → funded with payouts, a trailing-drawdown breach followed by a reset in progress, a
daily-loss breach, a failed retry, and a EUR instant-funded account with copied trades), ~500
trades with journals, emotions and tags, payouts in every state, personal risk rules, and a
EUR/USD rate. It prints each account's rule-engine state so you can check the statuses match.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit tests (financial calculations, parsers, rules) |
| `npm run test:integration` | Database tests incl. user data isolation (needs `db:start`) |
| `npm run typecheck` / `npm run lint` | Type checking / ESLint |
| `npm run db:start` | Local PostgreSQL 17 server (embedded-postgres, no Docker) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migration:new -- <name>` | Generate a migration from schema changes |
| `npm run db:seed` | (Re)create the demo user and data |
| `npm run db:reset` | Drop everything, migrate, seed |

## Deploying (Vercel + Neon/Supabase)

1. Create a Postgres database (Neon or Supabase). Use the **pooled** connection string.
2. Set env vars in Vercel: `DATABASE_URL`, `DATABASE_POOL_MAX` (e.g. 5), `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL` (your https URL).
3. Run `npx prisma migrate deploy` against the production database (locally or in CI).
4. Deploy. The build runs `prisma generate` automatically.

Screenshots use a storage driver interface; the included local-disk driver is fine for a single
server but **not persistent on Vercel** — add an S3/Vercel Blob driver in `src/server/storage`
before relying on uploads in production.

## What's where

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture, data flow, financial
conventions and security model. Short version:

- `src/lib/calc/` — every financial formula, pure and unit-tested
- `src/server/services/rebuild.ts` — recomputes derived trade data, daily performance and rule
  violations after any change
- `src/server/queries/` — read models, always scoped by user
- `src/server/actions/` — validated, authorised mutations
- `src/app/(app)/` — the pages

## Metric definitions

| Metric | Definition |
| --- | --- |
| Net P&L | Gross − commission + swap. A platform-reported gross P&L overrides the price calculation. |
| Win rate | Wins ÷ (wins + losses). Break-even trades (\|net\| ≤ your tolerance) are excluded and shown separately. |
| Profit factor | Gross profit ÷ gross loss. |
| Expectancy | Average net P&L per trade (= win rate × avg win − loss rate × avg loss). Also shown in R. |
| R multiple | Net P&L ÷ initial risk (\|entry − stop\| × size × point value, or your override). Trades without a valid stop have no R. |
| Max drawdown | Largest peak-to-trough decline of the closed-trade equity path, starting from the starting balance. |
| Recovery factor | Net profit ÷ max drawdown. |
| Sharpe / Sortino | Annualised (√252) on daily returns of trading days; shown only with ≥ 20 trading days. |
| Profit target progress | (Balance − starting balance) ÷ (target % × starting balance). |
| Daily loss remaining | Balance − (start-of-day balance − daily limit). Limit is % of starting balance or of the day-start balance, per account rule. |
| Drawdown remaining | Balance − floor. Static floor = start − max loss; trailing floors follow the high-water mark (end-of-day or per closed trade) and optionally lock at the starting balance. |
| Net cash flow | Payouts received − (fees − refunds). Account size and trading P&L are not cash. |
| Return on fees | Net cash flow ÷ net fees. Payout multiple = payouts ÷ fees. |

All rule checks use **closed-trade balance**; PropTrack cannot see floating equity, so an
equity-based limit can be hit on the platform before it shows here.

Copies of one trade taken on several accounts are linked; money totals include every copy, while
trade statistics (win rate, R, trade counts) count the idea once.

## Not implemented yet

- Broker/platform API integrations (MT4/MT5, cTrader, TradingView, IBKR, DXtrade, Match-Trader) —
  the adapter interface and registry exist; CSV import is available.
- AI features (trade review, journal summaries, coaching, natural-language questions) — the
  analytics dataset is structured to serve as their grounded input.
- Live exchange rates (rates are entered in Settings).
