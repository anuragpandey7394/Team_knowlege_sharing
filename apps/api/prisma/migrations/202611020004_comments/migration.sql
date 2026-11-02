-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "pageVersionId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "tombstonedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentRevision" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "commentId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "text" VARCHAR(5000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_organizationId_pageId_createdAt_id_idx" ON "Comment"("organizationId", "pageId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_organizationId_id_key" ON "Comment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CommentRevision_organizationId_commentId_number_key" ON "CommentRevision"("organizationId", "commentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CommentRevision_organizationId_commentId_id_key" ON "CommentRevision"("organizationId", "commentId", "id");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_organizationId_pageId_fkey" FOREIGN KEY ("organizationId", "pageId") REFERENCES "Page"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_organizationId_pageId_pageVersionId_fkey" FOREIGN KEY ("organizationId", "pageId", "pageVersionId") REFERENCES "PageVersion"("organizationId", "pageId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_organizationId_commentId_fkey" FOREIGN KEY ("organizationId", "commentId") REFERENCES "Comment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION immutable_comment_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Comment revisions are immutable'; END;
$$;
CREATE TRIGGER comment_revision_immutable BEFORE UPDATE OR DELETE ON "CommentRevision"
FOR EACH ROW EXECUTE FUNCTION immutable_comment_revision();
ALTER TABLE "OutboxEvent" DROP CONSTRAINT "OutboxEvent_page_version_fkey";
-- Source-specific composite validation retains tenant anchoring for both source types.
CREATE FUNCTION validate_outbox_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sourceType" = 'page' THEN
    IF NOT EXISTS (SELECT 1 FROM "PageVersion" WHERE "organizationId" = NEW."organizationId" AND "pageId" = NEW."sourceId" AND id = NEW."sourceVersionId") THEN
      RAISE EXCEPTION 'Invalid page event source';
    END IF;
  ELSIF NEW."sourceType" = 'comment' THEN
    IF NOT EXISTS (SELECT 1 FROM "CommentRevision" WHERE "organizationId" = NEW."organizationId" AND "commentId" = NEW."sourceId" AND id = NEW."sourceVersionId") THEN
      RAISE EXCEPTION 'Invalid comment event source';
    END IF;
  ELSE RAISE EXCEPTION 'Invalid event source type';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER outbox_source_check BEFORE INSERT OR UPDATE ON "OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION validate_outbox_source();
