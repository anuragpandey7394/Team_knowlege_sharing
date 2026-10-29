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
