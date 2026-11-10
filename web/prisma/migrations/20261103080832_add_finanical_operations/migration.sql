-- CreateEnum
CREATE TYPE "withdrawal_request_status" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "idempotency_status" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "outbox_event_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount_satang" BIGINT NOT NULL,
    "simulated_destination_reference" VARCHAR(255),
    "status" "withdrawal_request_status" NOT NULL DEFAULT 'REQUESTED',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "ledger_transaction_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "user_id" UUID,
    "operation_type" VARCHAR(80) NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "status" "idempotency_status" NOT NULL DEFAULT 'PROCESSING',
    "response_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_event_status" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_events" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_idempotency_key_key" ON "withdrawal_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "withdrawal_requests_user_id_created_at_idx" ON "withdrawal_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_wallet_id_status_idx" ON "withdrawal_requests"("wallet_id", "status");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_idempotency_key_key" ON "idempotency_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "idempotency_records_user_id_created_at_idx" ON "idempotency_records"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_records_status_created_at_idx" ON "idempotency_records"("status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_idx" ON "outbox_events"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "outbox_events_created_at_idx" ON "outbox_events"("created_at");

-- CreateIndex
CREATE INDEX "system_events_event_type_created_at_idx" ON "system_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "system_events_source_created_at_idx" ON "system_events"("source", "created_at");

-- CreateIndex
CREATE INDEX "system_events_status_created_at_idx" ON "system_events"("status", "created_at");

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
