BEGIN;
CREATE TABLE "RateLimit" (
  "key" VARCHAR(150) PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 1 CHECK ("attempts" > 0),
  "resetsAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "RateLimit_resetsAt_idx" ON "RateLimit"("resetsAt");
COMMIT;
