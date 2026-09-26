-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('CHALLENGE', 'PASSED', 'FUNDED', 'PAYOUT_ELIGIBLE', 'PAYOUT_RECEIVED', 'FAILED', 'BREACHED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ONE_STEP', 'TWO_STEP', 'THREE_STEP', 'INSTANT_FUNDED', 'FUNDED', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DrawdownType" AS ENUM ('STATIC', 'TRAILING_EOD', 'TRAILING_BALANCE');

-- CreateEnum
CREATE TYPE "DailyLossBasis" AS ENUM ('STARTING_BALANCE', 'DAY_START_BALANCE');

-- CreateEnum
CREATE TYPE "AccountEventType" AS ENUM ('CHALLENGE_PURCHASED', 'CHALLENGE_STARTED', 'PHASE_PASSED', 'CHALLENGE_PASSED', 'FUNDED_ACTIVATED', 'PAYOUT_REQUESTED', 'PAYOUT_APPROVED', 'PAYOUT_RECEIVED', 'PAYOUT_REJECTED', 'ACCOUNT_BREACHED', 'ACCOUNT_FAILED', 'ACCOUNT_RESET', 'ACCOUNT_SUSPENDED', 'ACCOUNT_CLOSED', 'STATUS_CHANGED', 'NOTE');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('CHALLENGE', 'RESET', 'ACTIVATION', 'SUBSCRIPTION', 'DATA', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('FOREX', 'INDEX', 'COMMODITY', 'CRYPTO', 'STOCK', 'FUTURES', 'OTHER');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('SETUP', 'TIMEFRAME', 'TRADE_TYPE', 'ENTRY_MODEL', 'CONFLUENCE', 'MARKET_CONDITION');

-- CreateEnum
CREATE TYPE "TagKind" AS ENUM ('POSITIVE', 'MISTAKE', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('MANUAL', 'CSV', 'API');

-- CreateEnum
CREATE TYPE "TradeGrade" AS ENUM ('A_PLUS', 'A', 'B', 'C', 'D', 'F');

-- CreateEnum
CREATE TYPE "ScreenshotPhase" AS ENUM ('BEFORE', 'DURING', 'AFTER');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'REQUESTED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "TradingRuleType" AS ENUM ('MAX_RISK_PER_TRADE_PCT', 'MAX_TRADES_PER_DAY', 'MAX_LOSING_TRADES_PER_DAY', 'MAX_CONSECUTIVE_LOSSES_PER_DAY', 'MAX_DAILY_LOSS_PCT', 'MAX_DAILY_LOSS_AMOUNT', 'MAX_POSITION_SIZE', 'TRADING_HOURS', 'MIN_MINUTES_BETWEEN_TRADES');

-- CreateEnum
CREATE TYPE "ViolationSource" AS ENUM ('PROP_RULE', 'PERSONAL_RULE');

-- CreateEnum
CREATE TYPE "ViolationSeverity" AS ENUM ('WARNING', 'BREACH');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "riskPercent" DECIMAL(8,4),
    "maxTradesPerDay" INTEGER,
    "maxDailyLossPct" DECIMAL(8,4),
    "defaultRR" DECIMAL(8,4),
    "breakevenTolerance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "insightMinTrades" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prop_firms" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "notes" TEXT,
    "ruleTemplate" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prop_firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propFirmId" TEXT,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT,
    "accountSize" DECIMAL(18,4) NOT NULL,
    "startingBalance" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "accountType" "AccountType" NOT NULL DEFAULT 'TWO_STEP',
    "phase" INTEGER,
    "status" "AccountStatus" NOT NULL DEFAULT 'CHALLENGE',
    "purchasedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "parentAccountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trading_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_rules" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "profitTargetPct" DECIMAL(8,4),
    "maxDailyLossPct" DECIMAL(8,4),
    "dailyLossBasis" "DailyLossBasis" NOT NULL DEFAULT 'STARTING_BALANCE',
    "maxOverallLossPct" DECIMAL(8,4),
    "drawdownType" "DrawdownType" NOT NULL DEFAULT 'STATIC',
    "trailingLocksAtStart" BOOLEAN NOT NULL DEFAULT true,
    "minTradingDays" INTEGER,
    "maxTradingDays" INTEGER,
    "maxPositionSize" DECIMAL(20,6),
    "maxOpenContracts" DECIMAL(20,6),
    "newsTradingAllowed" BOOLEAN NOT NULL DEFAULT true,
    "weekendHoldingAllowed" BOOLEAN NOT NULL DEFAULT true,
    "consistencyPct" DECIMAL(8,4),
    "payoutThresholdAmount" DECIMAL(18,4),
    "payoutFrequencyDays" INTEGER,
    "profitSplitPct" DECIMAL(8,4),
    "dayResetHour" INTEGER NOT NULL DEFAULT 0,
    "dayResetTimezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_events" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "AccountEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,4),
    "fromStatus" "AccountStatus",
    "toStatus" "AccountStatus",
    "payoutId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_fees" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "FeeType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "refunded" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'OTHER',
    "pointValue" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "tickSize" DECIMAL(20,10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trading_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TagKind" NOT NULL DEFAULT 'NEUTRAL',
    "color" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "groupId" TEXT,
    "instrumentId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'CLOSED',
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "entryPrice" DECIMAL(20,8) NOT NULL,
    "exitPrice" DECIMAL(20,8),
    "stopLoss" DECIMAL(20,8),
    "takeProfit" DECIMAL(20,8),
    "quantity" DECIMAL(20,6) NOT NULL,
    "pointValue" DECIMAL(20,8) NOT NULL,
    "commission" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "swap" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reportedGrossPnl" DECIMAL(18,4),
    "riskAmountOverride" DECIMAL(18,4),
    "mfePrice" DECIMAL(20,8),
    "maePrice" DECIMAL(20,8),
    "grossPnl" DECIMAL(18,4),
    "netPnl" DECIMAL(18,4),
    "initialRisk" DECIMAL(18,4),
    "riskPercent" DECIMAL(10,4),
    "rMultiple" DECIMAL(12,4),
    "plannedRR" DECIMAL(12,4),
    "balanceBefore" DECIMAL(18,4),
    "tradingDay" TEXT,
    "strategyId" TEXT,
    "sessionId" TEXT,
    "setup" TEXT,
    "timeframe" TEXT,
    "tradeType" TEXT,
    "entryModel" TEXT,
    "confluences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "marketCondition" TEXT,
    "grade" "TradeGrade",
    "source" "TradeSource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "importBatchId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_exits" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "exitedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_exits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_tag_assignments" (
    "tradeId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "trade_tag_assignments_pkey" PRIMARY KEY ("tradeId","tagId")
);

-- CreateTable
CREATE TABLE "trade_journals" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "reason" TEXT,
    "thesis" TEXT,
    "setupExplanation" TEXT,
    "expectedOutcome" TEXT,
    "riskJustification" TEXT,
    "whatHappened" TEXT,
    "followedPlan" BOOLEAN,
    "changes" TEXT,
    "wentWell" TEXT,
    "wentWrong" TEXT,
    "lesson" TEXT,
    "emotionalState" TEXT,
    "mistakes" TEXT,
    "confidence" INTEGER,
    "stress" INTEGER,
    "fear" INTEGER,
    "greed" INTEGER,
    "patience" INTEGER,
    "fomo" INTEGER,
    "revenge" INTEGER,
    "boredom" INTEGER,
    "discipline" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_screenshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "phase" "ScreenshotPhase" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "amountRequested" DECIMAL(18,4) NOT NULL,
    "amountReceived" DECIMAL(18,4),
    "profitSplitPct" DECIMAL(8,4),
    "fees" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "currency" TEXT NOT NULL,
    "deductFromBalance" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_performance" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "trades" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "grossPnl" DECIMAL(18,4) NOT NULL,
    "netPnl" DECIMAL(18,4) NOT NULL,
    "rTotal" DECIMAL(12,4),
    "startBalance" DECIMAL(18,4) NOT NULL,
    "endBalance" DECIMAL(18,4) NOT NULL,
    "minBalance" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "daily_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "type" "TradingRuleType" NOT NULL,
    "value" DECIMAL(18,4),
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "hardLimit" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trading_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_violations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tradeId" TEXT,
    "tradingRuleId" TEXT,
    "source" "ViolationSource" NOT NULL,
    "severity" "ViolationSeverity" NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "actual" DECIMAL(18,4),
    "limit" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "filename" TEXT,
    "rowCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "config" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_userId_base_quote_key" ON "exchange_rates"("userId", "base", "quote");

-- CreateIndex
CREATE UNIQUE INDEX "prop_firms_userId_name_key" ON "prop_firms"("userId", "name");

-- CreateIndex
CREATE INDEX "trading_accounts_userId_status_idx" ON "trading_accounts"("userId", "status");

-- CreateIndex
CREATE INDEX "trading_accounts_propFirmId_idx" ON "trading_accounts"("propFirmId");

-- CreateIndex
CREATE UNIQUE INDEX "account_rules_accountId_key" ON "account_rules"("accountId");

-- CreateIndex
CREATE INDEX "account_events_accountId_occurredAt_idx" ON "account_events"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "account_fees_accountId_idx" ON "account_fees"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_userId_symbol_key" ON "instruments"("userId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "strategies_userId_name_key" ON "strategies"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "trading_sessions_userId_name_key" ON "trading_sessions"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_userId_kind_name_key" ON "categories"("userId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "trade_tags_userId_name_key" ON "trade_tags"("userId", "name");

-- CreateIndex
CREATE INDEX "trades_userId_closedAt_idx" ON "trades"("userId", "closedAt");

-- CreateIndex
CREATE INDEX "trades_accountId_closedAt_idx" ON "trades"("accountId", "closedAt");

-- CreateIndex
CREATE INDEX "trades_userId_fingerprint_idx" ON "trades"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "trades_groupId_idx" ON "trades"("groupId");

-- CreateIndex
CREATE INDEX "trades_strategyId_idx" ON "trades"("strategyId");

-- CreateIndex
CREATE INDEX "trade_exits_tradeId_idx" ON "trade_exits"("tradeId");

-- CreateIndex
CREATE INDEX "trade_tag_assignments_tagId_idx" ON "trade_tag_assignments"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "trade_journals_tradeId_key" ON "trade_journals"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "trade_screenshots_storageKey_key" ON "trade_screenshots"("storageKey");

-- CreateIndex
CREATE INDEX "trade_screenshots_tradeId_idx" ON "trade_screenshots"("tradeId");

-- CreateIndex
CREATE INDEX "payouts_userId_status_idx" ON "payouts"("userId", "status");

-- CreateIndex
CREATE INDEX "payouts_accountId_idx" ON "payouts"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_performance_accountId_day_key" ON "daily_performance"("accountId", "day");

-- CreateIndex
CREATE INDEX "trading_rules_userId_idx" ON "trading_rules"("userId");

-- CreateIndex
CREATE INDEX "rule_violations_userId_occurredAt_idx" ON "rule_violations"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "rule_violations_accountId_idx" ON "rule_violations"("accountId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_propFirmId_fkey" FOREIGN KEY ("propFirmId") REFERENCES "prop_firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "trading_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_rules" ADD CONSTRAINT "account_rules_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_fees" ADD CONSTRAINT "account_fees_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading_sessions" ADD CONSTRAINT "trading_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_groups" ADD CONSTRAINT "trade_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "trade_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "trading_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_exits" ADD CONSTRAINT "trade_exits_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_tag_assignments" ADD CONSTRAINT "trade_tag_assignments_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_tag_assignments" ADD CONSTRAINT "trade_tag_assignments_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "trade_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_journals" ADD CONSTRAINT "trade_journals_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_screenshots" ADD CONSTRAINT "trade_screenshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_screenshots" ADD CONSTRAINT "trade_screenshots_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_performance" ADD CONSTRAINT "daily_performance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading_rules" ADD CONSTRAINT "trading_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading_rules" ADD CONSTRAINT "trading_rules_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_violations" ADD CONSTRAINT "rule_violations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_violations" ADD CONSTRAINT "rule_violations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_violations" ADD CONSTRAINT "rule_violations_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_violations" ADD CONSTRAINT "rule_violations_tradingRuleId_fkey" FOREIGN KEY ("tradingRuleId") REFERENCES "trading_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
