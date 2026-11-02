import { randomUUID } from "node:crypto";
import type { Database } from "./database.js";
import type { Prisma } from "./generated/prisma/client.js";
import type {
  SourceIdentity,
  IndexSource,
} from "../../../packages/contracts/src/ai.js";
import { sourceIdentitySchema } from "../../../packages/contracts/src/ai.js";
import { transaction } from "./transaction.js";
type Tx = Prisma.TransactionClient;
type Reader = Pick<
  Database,
  "page" | "comment" | "pageVersion" | "membership" | "indexState"
>;
export async function sourceSnapshot(
  db: Reader,
  source: SourceIdentity,
): Promise<IndexSource | null> {
  if (source.sourceType === "page") {
    const version = await db.pageVersion.findFirst({
      where: {
        organizationId: source.organizationId,
        pageId: source.sourceId,
        id: source.sourceVersionId,
      },
      include: { publisher: true, page: { include: { space: true } } },
    });
    if (!version) return null;
    const page = version.page;
    return {
      ...source,
      pageId: page.id,
      pageVersionId: version.id,
      spaceId: page.spaceId,
      title: version.title,
      text: version.text,
      author: version.publisher.displayName,
      publishedAt: version.createdAt.toISOString(),
      current:
        !page.archivedAt &&
        !page.space.archivedAt &&
        page.publishedVersionId === version.id,
    };
  }
  const comment = await db.comment.findFirst({
    where: { organizationId: source.organizationId, id: source.sourceId },
    include: {
      revisions: { where: { id: source.sourceVersionId } },
      author: true,
      page: { include: { space: true } },
      pageVersion: true,
    },
  });
  const revision = comment?.revisions[0];
  if (!comment || !revision) return null;
  return {
    ...source,
    pageId: comment.pageId,
    pageVersionId: comment.pageVersionId,
    spaceId: comment.page.spaceId,
    title: comment.pageVersion.title,
    text: comment.tombstonedAt ? "" : revision.text,
    author: comment.author.displayName,
    publishedAt: revision.createdAt.toISOString(),
    current:
      !comment.tombstonedAt &&
      !comment.page.archivedAt &&
      !comment.page.space.archivedAt &&
      comment.page.publishedVersionId !== null &&
      comment.revision === revision.number,
  };
}
const key = (s: SourceIdentity) => ({
  organizationId_sourceType_sourceId_sourceVersionId_generation: s,
});
export async function indexView(db: Reader, source: SourceIdentity) {
  const snapshot = await sourceSnapshot(db, source);
  if (!snapshot?.current)
    return {
      status: snapshot ? ("excluded" as const) : ("superseded" as const),
      generation: source.generation,
      simulated: false,
      safeError: null,
      eligible: false,
    };
  const state = await db.indexState.findUnique({ where: key(source) });
  return {
    status: state?.simulated
      ? ("awaiting_provider" as const)
      : ((state?.status ?? "awaiting_provider") as
          | "awaiting_provider"
          | "queued"
          | "processing"
          | "ready"
          | "failed"
          | "superseded"
          | "excluded"),
    generation: source.generation,
    simulated: state?.simulated ?? false,
    safeError: state?.safeError ?? null,
    eligible: state?.status === "ready" && !state.simulated,
  };
}
async function state(
  tx: Tx,
  source: SourceIdentity,
  status: string,
  now: Date,
  simulated = false,
  safeError: string | null = null,
) {
  const data = {
    status,
    simulated,
    safeError,
    indexedAt: status === "ready" ? now : null,
  };
  await tx.indexState.upsert({
    where: key(source),
    create: { ...source, ...data },
    update: data,
  });
}
export async function dispatch(db: Database, now = new Date(), generation = 1) {
  return transaction(db, async (tx) => {
    const events = await tx.outboxEvent.findMany({
      where: { state: "PENDING" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    for (const event of events) {
      await tx.job.upsert({
        where: { eventId: event.id },
        create: {
          eventId: event.id,
          organizationId: event.organizationId,
          nextAttemptAt: now,
        },
        update: {},
      });
      const source = sourceIdentitySchema.parse({
        organizationId: event.organizationId,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        sourceVersionId: event.sourceVersionId,
        generation,
      });
      const existing = await tx.indexState.findUnique({ where: key(source) });
      if (!existing) await state(tx, source, "queued", now);
      await tx.outboxEvent.update({
        where: { id: event.id },
        data: { state: "DISPATCHED" },
      });
    }
    return events.length;
  });
}
export async function claim(
  db: Database,
  now = new Date(),
  leaseMs = 15000,
  generation = 1,
) {
  return transaction(db, async (tx) => {
    const candidates = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Job" WHERE (state = 'QUEUED' AND "nextAttemptAt" <= ${now}) OR (state = 'PROCESSING' AND "leaseUntil" <= ${now})
      ORDER BY "nextAttemptAt", id FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!candidates[0]) return null;
    const job = await tx.job.findUniqueOrThrow({
      where: { id: candidates[0].id },
      include: { event: true },
    });
    const source = sourceIdentitySchema.parse({
      organizationId: job.organizationId,
      sourceType: job.event.sourceType,
      sourceId: job.event.sourceId,
      sourceVersionId: job.event.sourceVersionId,
      generation,
    });
    if (job.attempts >= 3) {
      await tx.job.update({
        where: { id: job.id },
        data: {
          state: "FAILED",
          leaseToken: null,
          leaseUntil: null,
          safeError: "LEASE_EXHAUSTED",
        },
      });
      await state(tx, source, "failed", now, false, "LEASE_EXHAUSTED");
      return null;
    }
    const token = randomUUID();
    const leased = await tx.job.update({
      where: { id: job.id },
      data: {
        state: "PROCESSING",
        attempts: { increment: 1 },
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + leaseMs),
        safeError: null,
      },
    });
    await state(tx, source, "processing", now);
    return { ...leased, token, source };
  });
}
export type ClaimedJob = NonNullable<Awaited<ReturnType<typeof claim>>>;
export async function heartbeat(
  db: Database,
  job: ClaimedJob,
  now = new Date(),
  leaseMs = 15000,
) {
  const changed = await db.job.updateMany({
    where: {
      id: job.id,
      state: "PROCESSING",
      leaseToken: job.token,
      leaseUntil: { gt: now },
    },
    data: { leaseUntil: new Date(now.getTime() + leaseMs) },
  });
  return changed.count === 1;
}
export class AdapterFailure extends Error {
  constructor(public transient: boolean) {
    super("Index adapter failed");
  }
}
export type IndexAdapter = {
  mode: "disabled" | "fake";
  index: (source: IndexSource, signal: AbortSignal) => Promise<void>;
};
export const disabledIndexAdapter: IndexAdapter = {
  mode: "disabled",
  index: async () => {},
};
export async function complete(
  db: Database,
  job: ClaimedJob,
  outcome: {
    status: "awaiting_provider" | "ready" | "failed";
    simulated?: boolean;
    transient?: boolean;
  },
  now = new Date(),
) {
  return transaction(db, async (tx) => {
    const current = await tx.job.findFirst({
      where: {
        id: job.id,
        state: "PROCESSING",
        leaseToken: job.token,
        leaseUntil: { gt: now },
      },
    });
    if (!current) return false;
    const snapshot = await sourceSnapshot(tx, job.source);
    const invalid = !snapshot?.current;
    const retry =
      !invalid &&
      outcome.status === "failed" &&
      outcome.transient &&
      current.attempts < 3;
    const status = invalid ? "superseded" : retry ? "queued" : outcome.status;
    await tx.job.update({
      where: { id: job.id },
      data: {
        state: retry
          ? "QUEUED"
          : outcome.status === "failed" && !invalid
            ? "FAILED"
            : "DONE",
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: retry
          ? new Date(now.getTime() + 1000 * 2 ** (current.attempts - 1))
          : now,
        safeError:
          outcome.status === "failed" && !invalid
            ? "INDEX_ADAPTER_UNAVAILABLE"
            : null,
      },
    });
    await state(
      tx,
      job.source,
      status,
      now,
      outcome.simulated ?? false,
      outcome.status === "failed" && !invalid
        ? "INDEX_ADAPTER_UNAVAILABLE"
        : null,
    );
    return true;
  });
}
export async function runOne(
  db: Database,
  adapter: IndexAdapter = disabledIndexAdapter,
  now = () => new Date(),
  generation = 1,
) {
  if (adapter.mode === "fake" && process.env.NODE_ENV !== "test")
    throw new Error("Fake indexing is test-only");
  const job = await claim(db, now(), 15000, generation);
  if (!job) return false;
  const source = await sourceSnapshot(db, job.source);
  if (!source?.current) {
    await complete(db, job, { status: "awaiting_provider" }, now());
    return true;
  }
  if (adapter.mode === "disabled") {
    await complete(db, job, { status: "awaiting_provider" }, now());
    return true;
  }
  const controller = new AbortController();
  const beat = setInterval(() => {
    void heartbeat(db, job, now())
      .then((ok) => {
        if (!ok) controller.abort();
      })
      .catch(() => controller.abort());
  }, 4000);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      adapter.index(source, controller.signal),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new AdapterFailure(true));
        }, 10000);
      }),
    ]);
    await complete(db, job, { status: "ready", simulated: true }, now());
  } catch (error) {
    await complete(
      db,
      job,
      {
        status: "failed",
        transient: error instanceof AdapterFailure && error.transient,
      },
      now(),
    );
  } finally {
    clearInterval(beat);
    if (timeout) clearTimeout(timeout);
  }
  return true;
}
