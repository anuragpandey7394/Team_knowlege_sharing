BEGIN;
ALTER TABLE "PageVersion" ADD COLUMN "draftRevision" INTEGER,
ADD COLUMN "idempotencyKey" UUID,
ADD COLUMN "parentId" UUID,
ADD COLUMN "spaceId" UUID;
-- M04 had no publication endpoint. Preserve any existing synthetic versions.
UPDATE "PageVersion" v SET "draftRevision" = 0, "idempotencyKey" = v.id,
 "parentId" = p."parentId", "spaceId" = p."spaceId"
FROM "Page" p WHERE p.id = v."pageId" AND p."organizationId" = v."organizationId";
ALTER TABLE "PageVersion" ALTER COLUMN "draftRevision" SET NOT NULL,
 ALTER COLUMN "idempotencyKey" SET NOT NULL, ALTER COLUMN "spaceId" SET NOT NULL;

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sourceType" VARCHAR(30) NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceVersionId" UUID NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "dedupeKey" VARCHAR(200) NOT NULL,
    "state" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "resourceId" UUID NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_organizationId_state_createdAt_idx" ON "OutboxEvent"("organizationId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PageVersion_organizationId_pageId_idempotencyKey_key" ON "PageVersion"("organizationId", "pageId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Version snapshots cannot be changed even by accidental ORM writes.
CREATE FUNCTION immutable_page_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published versions are immutable'; END;
$$;
CREATE TRIGGER page_version_immutable BEFORE UPDATE OR DELETE ON "PageVersion"
FOR EACH ROW EXECUTE FUNCTION immutable_page_version();
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_page_version_fkey"
FOREIGN KEY ("organizationId", "sourceId", "sourceVersionId")
REFERENCES "PageVersion" ("organizationId", "pageId", "id");
COMMIT;
