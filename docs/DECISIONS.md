# Architecture decisions

## ADR-001 — Preserve the specified workspace architecture

Accepted 2026-10-29. Preserve React/Vite/React Router/TanStack Query web, Fastify/Zod/Prisma API, PostgreSQL and Mailpit, Tiptap editor, Vitest/Playwright tests, and later private FastAPI service. npm workspaces separate apps/web, apps/api, packages/contracts and packages/config; infra/compose and infra/terraform remain separate. No cloud resources or paid model calls in foundation.

Use the installed Node 22.22.1 maintenance LTS runtime. Vite 8.3.5 and Vitest 5.0.5 registry engines accept Node >=22.12.0; React 19.3.1 and Zod 4.6.7 were confirmed in npm metadata. TypeScript 5.9.3 is deliberately used as the supported stable 5.x compiler while upstream's latest tag is 7.0.2; it meets Prisma's documented 5.4+ floor. Exact installed versions and transitive integrity are in package-lock.json. Later API implementation will use stable Fastify 5 and Prisma 7 (registry latest tag points to a Prisma 8 release candidate; do not adopt a prerelease by accident). Recheck exact API package versions and advisories at M01 installation.

Official references reviewed at bootstrap:

- https://vite.dev/guide/ — runtime and React tooling.
- https://vitest.dev/guide/ — test runner and Vite compatibility.
- https://fastify.dev/docs/latest/Reference/LTS/ — supported framework/runtime policy.
- https://www.prisma.io/docs/orm/v7/reference/system-requirements — Node and TypeScript requirements.

Keep canonical specification/ledger/progress at root as already established; docs/evidence holds records and docs/DECISIONS.md holds decisions. Future scripts are present as explicit failures until real capabilities are implemented, preventing false green verification. Small worker pools limit memory use on the approximately 8 GB laptop. Repository-local npm cache resolves the read-only global cache without changing machine permissions.

## ADR-002 — Local infrastructure and Prisma 7 adapter

Accepted 2026-10-29. Use Prisma 7.10.1 with matching client/pg adapter, driver-managed pool (maximum 5), generated TypeScript client ignored by Git and bundled with esbuild. Use Fastify 5.12.7 with fastify-type-provider-zod 7, @fastify/swagger 9 and Zod 4; shared strict request schemas drive OpenAPI and runtime validation. Dependencies resolved from registry and pinned by lockfile. Official Prisma v7 generator and connection-pool documentation and Fastify factory/type-provider documentation reviewed before implementation:

- https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators
- https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool
- https://fastify.dev/docs/latest/Reference/Server/
- https://github.com/turkerdev/fastify-type-provider-zod

PostgreSQL 17 Alpine and Mailpit image digests are pinned from successful pulls. Existing port 5432 was occupied; bind this project's host-development DB on loopback 55432 rather than disrupting unrelated services. Container-to-container PostgreSQL remains 5432. Base Compose has no DB publication; separate host/full local profiles control bindings. Named project volumes survive down. No hosted claim is made by the development full-app profile.

## ADR-003 — Authentication and reproducible browser verification

Accepted 2026-10-30. Use @node-rs/argon2 2.2.2 Argon2id, default 19 MiB/two passes/one lane with configurable bounded memory/time cost. Passwords accept 12–128 characters. This follows the reviewed OWASP password storage guidance and the maintained library API. Opaque 32-byte session/action tokens are hashed at rest. Verification defaults to 24 hours, reset to 30 minutes, sessions to seven days; earlier action tokens are consumed on resend and all sessions revoked on reset. Serializable database transactions retry serialization conflicts without bypassing invariants.

CSRF uses HMAC-signed tokens bound to the session (or a separate anonymous HttpOnly nonce before login), exact origin validation and a server-side CSRF hash for active sessions. Cookies are HttpOnly/SameSite=Lax and Secure in production. Production rejects the development signing secret and plain HTTP origin. Tokens stay in link fragments until explicit submission, avoiding request URL/referrer logging. No credentials in browser storage. PostgreSQL rate-limit counters are shared by API instances; IP limits do not trust browser headers. The local mail adapter retries only connection-stage failures before SMTP delivery can have occurred.

Playwright 1.64.1 uses actual Chromium, an isolated migrated test schema, actual UI/API and the Mailpit inbox. No authentication/network mocks. The harness uses separate API/web ports 3002/5174, cleans only its random schema, and stores only the schema identifier in ignored .cache. Browser/download/cache/temp paths remain repository-local. Tests assert real expiry by expiring the synthetic test session in that isolated database.

References reviewed:

- https://github.com/napi-rs/node-rs/tree/main/packages/argon2
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://playwright.dev/docs/test-webserver

## ADR-004 — Tenant-safe hierarchy and schema-validated rich text

Accepted 2026-11-02. Preserve Tiptap 3.32.1 pinned in the existing manifests/lockfile. Share the StarterKit/TableKit schema between browser editing and server validation; reject unsupported nodes/attributes/marks, unsafe URL protocols, excessive nesting/size and malformed ProseMirror structure. React renders whitelisted nodes and escaped text, avoiding raw HTML. Composite parent/space foreign keys enforce tenant and space boundaries. A common Space revision write serializes hierarchy changes; conditional draft revisions reject stale content independently. React Router's data-router context enables useBlocker without changing the application framework. Failed saves retain local state and require explicit comparison/merge on conflict.

Official references: https://tiptap.dev/docs/editor/getting-started/install/react and https://tiptap.dev/docs/editor/extensions/nodes/table; React Router useBlocker API already reviewed during setup. Browser rich-document replacement uses native sequential key events, since generic fill/insertText did not produce the intended ProseMirror model on a code/table selection; retention assertions remain unchanged. SMTP transport reuses one bounded connection to reduce transient connection setup failures, retaining bounded pre-connection retries.

Dependency review found minimatch 10.2.6 advisory GHSA-g3hv-75wg-m249 (https://github.com/advisories/GHSA-g3hv-75wg-m249). Pin the patched 11.0.1 through npm overrides instead of accepting npm's suggested incompatible ESLint downgrade. Node 22 is supported; actual lint/parser/type/unit/contract checks validate the override. Do not use audit fix --force or lower the audit gate.

## M05 publication and restoration defaults

Publish requires already published active ancestors so Readers can reach every published page through its tree. Keys are scoped to organization/page and bound to the expected draft revision; replay returns the original snapshot after capability checks. PostgreSQL rejects all version updates/deletes. Publication writes one version, current pointer, safe audit record and durable pending outbox event in a serializable transaction. M07 supplies dispatch; no indexing readiness is claimed. Page restore restores the selected page only, preserving descendants' individual archive flags; restoring at root is explicit. Search uses parameterized PostgreSQL English full-text queries and plain-text snippets escaped by React. Exact-version page URLs are the citation resolver; they always recheck membership.

## M06 comment references and archives

Comments store immutable plain-text revisions and the published page version current when posted. Exact links combine the original page-version URL and explicit comment/revision IDs; the API checks all tenant/page/comment/revision relationships. Tombstones suppress body text even for old revision references. Archived pages allow historical comment reads but reject mutations; historical page views show current comments with an explicit warning and no mutation controls. Moderation deletes advice rather than rewriting another author's text. Comment list membership labels are batched. Outbox source validation now uses a PostgreSQL trigger to enforce the composite page-version or comment-revision tenant relationship, because events cover both source types; dispatch/eligibility remains M07.

## M07 durable jobs and provider boundary

Separate outbox dispatch and leased job records use tenant-composite FKs and source-version-generation index state. Workers claim one job with FOR UPDATE SKIP LOCKED, random lease token, maximum three attempts, exponential 1s/2s retry delay, 15s lease and 4s heartbeat. Completion checks token, expiry and current source again; actual eligibility always rechecks current version/archive/tombstone and excludes simulated results. PostgreSQL keeps jobs durable across restart. A disabled adapter records awaiting_provider; test-only fake adapters cannot mark a real index ready. Mock chat is explicit dev/test simulation and rejected by production configuration.

Internal source reads require environment-secret Bearer service authentication and a current verified tenant membership, reject cookies, and validate exact tenant/source/version/generation. Only this service-only route is exempt from browser CSRF; ordinary mutations remain protected. There is no service writer or Python implementation. Source generation is configurable; incrementing it requires explicit reindex events, never trusting earlier generation readiness. Standalone TypeScript scripts use a repository-local temporary directory because the session has no usable /tmp. No dependencies or paid provider were added.
