# Database invariants and migration safety

Prisma migrations own application schema; migrations are reviewed SQL committed with application code. Identity/organization tables come first. Later knowledge, jobs and conversations are added with their actual vertical flows rather than unused tables.

Users have UUID IDs, unique lowercase-normalized email (database check enforces normalization), UTC timestamps, and password hashes never serialized to clients. Sessions and action tokens store only unique SHA-256 digests; revocation, expiry and consumption are checked server-side. Membership has a composite organization/user primary key. Every organization operation rechecks membership from the database; client-provided role/user headers are ignored. Organization-scoped resources added later require organization-inclusive unique keys/foreign keys, not UUID possession as authorization.

Organization creation and first Admin insertion will share a transaction in M03. Final-Admin changes must lock the organization row to serialize invariant checks. Invitation acceptance is transactional and exact verified email constrained at the route layer. No claim that these M03 workflows are already implemented.

Migrations use explicit BEGIN/COMMIT and are applied with `npm run db:migrate` to the configured dedicated development database. Never run migrate reset or destructive seeds on an unknown DB. Failed transactional migrations must be inspected (schema plus _prisma_migrations) before resolve/retry; never mark a migration applied without evidence. Before forward migrations, checkpoint and back up any meaningful development data. Disposable test schemas use random identifiers inside an explicit *_test database and are dropped only by the owning harness. Test database guard rejects the development DB, non-test DB names, missing NODE_ENV=test and production settings.

`demo:down` stops only this Compose project and retains volumes. It does not delete data. Backup/restore/upgrade demonstrations arrive at M09; hosted production is not authorized by local migration tooling.
