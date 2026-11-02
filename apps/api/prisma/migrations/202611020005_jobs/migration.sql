-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "state" VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "safeError" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexState" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sourceType" VARCHAR(30) NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceVersionId" UUID NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(30) NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "indexedAt" TIMESTAMPTZ(3),
    "safeError" VARCHAR(100),

    CONSTRAINT "IndexState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_eventId_key" ON "Job"("eventId");

-- CreateIndex
CREATE INDEX "Job_state_nextAttemptAt_leaseUntil_idx" ON "Job"("state", "nextAttemptAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "Job_organizationId_idx" ON "Job"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_organizationId_eventId_key" ON "Job"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "IndexState_organizationId_sourceType_sourceId_idx" ON "IndexState"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "IndexState_organizationId_sourceType_sourceId_sourceVersion_key" ON "IndexState"("organizationId", "sourceType", "sourceId", "sourceVersionId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_organizationId_id_key" ON "OutboxEvent"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_organizationId_eventId_fkey" FOREIGN KEY ("organizationId", "eventId") REFERENCES "OutboxEvent"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndexState" ADD CONSTRAINT "IndexState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER index_state_source_check BEFORE INSERT OR UPDATE ON "IndexState"
FOR EACH ROW EXECUTE FUNCTION validate_outbox_source();
ALTER TABLE "Job" ADD CONSTRAINT "Job_attempts_bounded" CHECK (attempts BETWEEN 0 AND 3);
ALTER TABLE "IndexState" ADD CONSTRAINT "IndexState_status_valid" CHECK (status IN ('awaiting_provider','queued','processing','ready','failed','superseded','excluded'));
