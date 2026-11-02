CREATE INDEX "PageVersion_fts_idx" ON "PageVersion" USING GIN (to_tsvector('english', title || ' ' || text));
