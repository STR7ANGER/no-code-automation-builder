-- CreateEnum
CREATE TYPE "TriggerKind" AS ENUM ('WEBHOOK', 'CRON');

-- CreateTable
CREATE TABLE "Trigger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "kind" "TriggerKind" NOT NULL,
    "schedule" TEXT,
    "secretCiphertext" TEXT NOT NULL,
    "secretIv" TEXT NOT NULL,
    "secretTag" TEXT NOT NULL,
    "nextFireAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerDelivery" (
    "id" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "executionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriggerDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetter" (
    "id" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trigger_kind_nextFireAt_idx" ON "Trigger"("kind", "nextFireAt");

-- CreateIndex
CREATE INDEX "Trigger_tenantId_workspaceId_idx" ON "Trigger"("tenantId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TriggerDelivery_triggerId_deliveryId_key" ON "TriggerDelivery"("triggerId", "deliveryId");

-- CreateIndex
CREATE INDEX "DeadLetter_triggerId_createdAt_idx" ON "DeadLetter"("triggerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerDelivery" ADD CONSTRAINT "TriggerDelivery_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetter" ADD CONSTRAINT "DeadLetter_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
