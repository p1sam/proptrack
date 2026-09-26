@AGENTS.md

# PropTrack — working conventions

Read `docs/ARCHITECTURE.md` first. Key rules:

- Financial math lives only in `src/lib/calc/*` (pure, unit-tested). Pages and queries call it; never re-implement a formula inline.
- Every server query takes `userId` first and scopes by it. Every action uses `createAction(schema, handler)` from `src/server/action.ts`, validates ownership of all referenced ids, and calls `rebuildAccount()` after changing trades/exits/payouts/rules.
- Money: never add floats directly — use `sumMoney`, `subMoney`, `MoneyAccumulator`.
- Shared zod schemas in `src/lib/validation/*` are used by both forms and actions.
- Pages are server components that `await requireUser()`; interactivity goes in small client components. Next 16: `params`/`searchParams` are Promises (`PageProps<"/route">`).
- UI: shadcn components in `src/components/ui`; app components in `src/components/app`. Use `Pnl`/`RValue`/`PctValue` for signed numbers (sign + colour), `StatCard`, `Section`, `PageHeader`, `EmptyState`, `Meter`. Colours via tokens (`text-profit`, `text-loss`, `text-warning`, `bg-card`, `var(--chart-1..5)`), never raw hex.
- Unimplemented features are labelled "Coming later", never faked.

Commands: `npm run db:start` (local Postgres), `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run db:seed` (demo: demo@proptrack.test / demo-password-123), `scripts/fetch-page.sh /path` (fetch a page as the demo user).
