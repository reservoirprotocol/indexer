-- Up Migration

ALTER TABLE "ft_balances" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "ft_balances" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "ft_transfer_events" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "ft_transfer_events" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "transactions" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "transaction_traces" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "usd_prices" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "api_keys" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "hourly_api_usage" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "hourly_api_usage" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "daily_api_usage" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "daily_api_usage" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "monthly_api_usage" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "monthly_api_usage" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "executions" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "execution_results" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "order_events" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "sources_v2" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Down Migration
