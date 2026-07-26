-- AlterTable
ALTER TABLE "Execution" ADD COLUMN     "replayOfId" TEXT;

-- CreateTable
CREATE TABLE "TenantQuota" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "maxExecutionsPerDay" INTEGER NOT NULL DEFAULT 10000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "nodeId" TEXT,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantQuota_tenantId_key" ON "TenantQuota"("tenantId");

-- CreateIndex
CREATE INDEX "ExecutionEvent_executionId_createdAt_idx" ON "ExecutionEvent"("executionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionEvent_executionId_sequence_key" ON "ExecutionEvent"("executionId", "sequence");

-- CreateIndex
CREATE INDEX "Execution_replayOfId_idx" ON "Execution"("replayOfId");

-- AddForeignKey
ALTER TABLE "TenantQuota" ADD CONSTRAINT "TenantQuota_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_replayOfId_fkey" FOREIGN KEY ("replayOfId") REFERENCES "Execution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEvent" ADD CONSTRAINT "ExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
