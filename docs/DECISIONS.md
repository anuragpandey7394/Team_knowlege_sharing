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
