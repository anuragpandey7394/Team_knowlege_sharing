BEGIN;
-- CreateTable
CREATE TABLE "Space" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000) NOT NULL DEFAULT '',
    "treeRevision" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "parentId" UUID,
    "creatorId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "publishedVersionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageDraft" (
    "pageId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PageDraft_pkey" PRIMARY KEY ("pageId")
);

-- CreateTable
CREATE TABLE "PageVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "publisherId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Space_organizationId_id_key" ON "Space"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Page_organizationId_spaceId_parentId_createdAt_id_idx" ON "Page"("organizationId", "spaceId", "parentId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Page_organizationId_id_key" ON "Page"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Page_organizationId_spaceId_id_key" ON "Page"("organizationId", "spaceId", "id");

-- CreateIndex
CREATE INDEX "PageDraft_organizationId_idx" ON "PageDraft"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PageDraft_organizationId_pageId_key" ON "PageDraft"("organizationId", "pageId");

-- CreateIndex
CREATE UNIQUE INDEX "PageVersion_organizationId_pageId_id_key" ON "PageVersion"("organizationId", "pageId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PageVersion_organizationId_pageId_number_key" ON "PageVersion"("organizationId", "pageId", "number");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_organizationId_spaceId_fkey" FOREIGN KEY ("organizationId", "spaceId") REFERENCES "Space"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_organizationId_spaceId_parentId_fkey" FOREIGN KEY ("organizationId", "spaceId", "parentId") REFERENCES "Page"("organizationId", "spaceId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_organizationId_id_publishedVersionId_fkey" FOREIGN KEY ("organizationId", "id", "publishedVersionId") REFERENCES "PageVersion"("organizationId", "pageId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PageDraft" ADD CONSTRAINT "PageDraft_organizationId_pageId_fkey" FOREIGN KEY ("organizationId", "pageId") REFERENCES "Page"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDraft" ADD CONSTRAINT "PageDraft_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_organizationId_pageId_fkey" FOREIGN KEY ("organizationId", "pageId") REFERENCES "Page"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Page" ADD CONSTRAINT "Page_not_own_parent" CHECK ("parentId" IS DISTINCT FROM "id");
ALTER TABLE "PageDraft" ADD CONSTRAINT "Draft_bounded" CHECK (length("text") <= 100000 AND "revision" >= 0);
COMMIT;
