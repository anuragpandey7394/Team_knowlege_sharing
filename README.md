# Team Knowledge Assistant

Multi-organization knowledge authoring and published history, with model-neutral AI contracts. The foundation is under construction; MILESTONES.md is the authoritative completion ledger. No real AI or cloud resources are enabled.

## Local bootstrap

Use Node 22.22.1 (`nvm use` if installed), npm 9+, Docker with Compose for M01 onward. The checked-in `.npmrc` keeps the cache inside the ignored `.cache/` directory.

```sh
npm ci
cp -n .env.example .env
npm run status
npm run checkpoint:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run dev
```

Web: http://localhost:5173, API reserved: http://localhost:3001, PostgreSQL reserved: 127.0.0.1:55432, SMTP: 127.0.0.1:1025, Mailpit inbox: http://localhost:8025. M01 serves the web shell and API bootstrap with database readiness. Authentication arrives in M02. Stop development with Ctrl-C. Never point tests or seeds at a shared/production database. `.env.example` contains only synthetic local defaults; `.env` is ignored.

Integration and contract suites run against PostgreSQL and Mailpit. Browser, seed and infrastructure commands remain explicit failures until their respective milestones implement the real checks. `verify:foundation` fails until all required suites exist and pass. No success-on-missing-tools behavior.

## Resume and evidence

Read AGENTS.md, IMPLEMENTATION_SPEC.md, MILESTONES.md, PROGRESS.md and docs/evidence. Run `git status`, inspect local/remote commits, then `npm run status`. Reconcile actual artifacts and evidence before continuing the earliest incomplete milestone. The status command is read-only and never executes commands from ledger text. See docs/DECISIONS.md for architecture decisions.

Milestone delivery uses develop → origin/develop with exact SHA comparison, no force-push. A future active Codex session can continue from `resume`; there is no unattended background runner. Cloud apply and paid AI require separate explicit authorization.

## Local services and API (M01)

```sh
npm run demo:up
npm run db:migrate
npm run db:generate
npm run dev
# In another terminal, with the same local services:
npm run test:integration
npm run test:contracts
# Stop npm run dev with Ctrl-C, then retain database/mail volumes:
npm run demo:down
```

Use `npm run demo:up -- --full` for the full local app container profile (isolated development image; installs at image build, migrates at startup). Stop it with `npm run demo:down -- --full` before switching profiles. The host-dev profile publishes only loopback PostgreSQL 55432, SMTP 1025 and inbox 8025. The full-app profile publishes loopback web/API/inbox and keeps PostgreSQL internal. These are local synthetic development profiles, not hosted production configurations. M10 adds production images/reverse proxy/HTTPS.

Health endpoints are `/health/live` and `/health/ready`; OpenAPI is `/api/v1/openapi.json`. API listens on 127.0.0.1:3001 by default, web proxies `/api` and `/health`. Logs omit query strings and sensitive headers. Origin checks allow only WEB_ORIGIN, and unknown input is rejected. API database connection errors produce readiness 503 while liveness stays 200. Graceful SIGINT/SIGTERM shutdown closes connections.

Integration tests migrate a new random schema within the explicit `tka_test` database, create synthetic fixtures, then drop only their schema. They never reset a shared database or delete all mail. The fixture session exists only to test M01 repository authorization; real sign-up/login acceptance belongs to M02. Prisma client is generated locally, ignored by Git, and bundled into the API build. See docs/DATABASE.md for invariant/migration safety rules.

## Authentication and browser tests (M02)

After migration, use the app's Create account screen with a synthetic address. Open http://localhost:8025, choose the verification email and follow its link, then explicitly click Verify email. Sign in and sign out from Your account. Forgot password sends a one-use reset link to the same local inbox; resending invalidates the earlier link. Mailpit never delivers real outbound mail. Do not copy tokens or passwords into logs or evidence.

```sh
npm run browser:install
npm run test:integration
npm run test:e2e
```

Chromium downloads into ignored .cache/ms-playwright. E2E starts its own isolated API/web on 3002/5174 and uses a disposable schema inside tka_test; keep host PostgreSQL/Mailpit running. It does not reset development data, reuse a manually running app, or fabricate auth. Stop the runner normally so it can clean up its own schema. After an abrupt interruption, reconcile the exact random schema identifier in .cache/e2e-schema.json before any cleanup; never sweep unknown test data.

Authentication defaults in .env.example: session seven days, verification 24 hours, reset 30 minutes, ten login attempts/identity and five mail requests/identity per 15 minutes (IP ceiling ten times the identity ceiling), Argon2id memory 19456 KiB/two passes/one lane. Bounded memory/time, expiry and rate values are configurable through the documented variables; invalid configurations fail startup. Verification/reset consume endpoints have additional 30-attempt windows. Counters persist across API instances. Hosted mode additionally requires a unique random CSRF_SECRET and HTTPS; the development key is rejected. Hosted SMTP delivery is not validated by local Mailpit tests.
