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

Integration and contract suites run against PostgreSQL and Mailpit. Seed and infrastructure commands remain explicit failures until their respective milestones implement the real checks. `verify:foundation` fails until all required suites exist and pass. No success-on-missing-tools behavior.

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

## Organizations and invitations (M03)

From Your account, open Your organizations. A verified user can create an organization and becomes its first Admin. Use Current organization to switch contexts. Admins can rename the organization, invite an exact email with a selected role, change roles, remove members, and revoke/resend invitations. Readers and other non-admins see the directory without administrative controls. The server checks permissions on every request, including existing sessions after removal. The final Admin cannot be removed or demoted.

To join, sign in/register with the exact invited address, verify it via Mailpit, and open the invitation from the local inbox. If sign-in was needed, the invitation route is retained for the login return. An invitation is one-use, expires in seven days and becomes invalid when revoked or replaced by resend. An Admin can issue a fresh invitation if a link is unavailable. Organization switching clears tenant query caches and remounts the workspace; it does not carry member/role data into the next organization. Collections use bounded pagination.

## Spaces and shared drafts (M04)

Open Browse knowledge from an organization. Editors/Admins can create/rename spaces, create root/child pages, and edit a shared draft with Tiptap headings, lists, bold/italic, safe links, code and tables. Save draft explicitly or wait for the short autosave debounce; the status shows Saved/Saving/Error. Reader/Reviewer members cannot see unpublished draft titles or body.

Tree branches load with bounded pagination. Use New child or Move current page under a displayed page; moving to the space root is explicit. Cross-space/tenant parents, cycles, excessive depth and stale structural revisions are rejected. Dirty navigation offers Keep editing or Leave without saving.

A conflicting save keeps your local edits. Load latest for comparison, merge deliberately in your editor, then choose Save my merged draft. A failed network request also preserves edits and permits retry. Do not close/reload a dirty tab without saving: local edits are intentionally not stored in browser storage. Publish the saved draft explicitly to make it visible to Readers.

## Publication, history, archive and search (M05)

Choose Publish saved draft after saving. The server checks the exact saved revision; publication does not change when the shared draft is later edited. Publish ancestors first. View published page shows creator, publisher, dates and version. Its permanent version link resolves the same immutable content after later publications, subject to current membership. Version history supports comparison of any selected version with the displayed version using plain-text removed/added content.

Search published pages uses PostgreSQL full-text search, optional named space selection and pagination. It reflects publication immediately and works without AI. AI status remains awaiting provider. Archive page and descendants removes that subtree from navigation/search. Historical permanent links remain available with an Archived label. Archive and restore in the editing workspace lists archived pages/spaces; restore the space and parent first or explicitly restore a page at root. Restoring a page leaves its descendants archived until individually restored. No hard deletion or old-version restore is offered.

## Comments and provenance (M06)

Reviewer, Editor and Admin members can add plain-text comments below a current published page, edit their own comments and delete their own comments. Admins can remove another author's comment with Moderate comment. Readers can read only. Comments are separate advice, labelled with author, timestamps, revision and page version when posted. Historical/archived page views are read-only and warn that the current comment may concern a different version.

Permanent comment revision links preserve the exact earlier revision after edits. Deletion/moderation shows unavailable content for every reference, including historical revisions. It never reveals the removed body. Stale edits return a conflict and preserve the text in the edit form for review. No inline comments, replies, notifications or approvals are implemented.

## Durable worker and AI contracts (M07)

With `.env` configured from `.env.example`, run `npm run worker` in a separate terminal. It dispatches PostgreSQL outbox records to bounded durable jobs, handles retries/leases and shuts down on Ctrl-C. Run one low-concurrency worker for the laptop demo. Stop the worker before stopping PostgreSQL. Production bundle: `node apps/api/dist/worker.js` with environment injected. No model or AWS credentials are loaded. A missing required database configuration fails startup.

AI_PROVIDER defaults to disabled. Publications remain readable/searchable while jobs settle in awaiting provider. Editor/Admin Retry indexing retains durable work and cannot attach a provider. Simulated indexing exists only in automated tests and is never eligible as a real index. Set INDEX_GENERATION when a future index definition changes, then explicitly retry/reindex current sources; old generation results never count as current.

`packages/contracts/src/ai.ts` and `services/ai/openapi.json` define the deferred Python service shapes. Regenerate with `npm run contracts:ai`; the contract suite checks parity. AI_SERVICE_TOKEN is optional and absent by default; when connecting a future private service, inject a unique random token through the environment. Do not put a token in a URL, browser bundle or source control. See services/ai/README.md for the authenticated service boundary and deferred implementation scope.

## Private chat shell (M08)

Open Private chat from organization settings or knowledge. Conversations belong only to their creator; organization Admins cannot read another member's chat. Choose organization-wide or a named space before creating a conversation. Scope is fixed afterward. History and message lists paginate; Delete conversation removes only your own conversation and its messages.

Default AI_PROVIDER=disabled: sending saves the question and reports AI is not connected, with no factual answer or paid call. Retry saved request reuses the same request without duplicate message rows. Cancellation/disconnect leaves a retryable cancelled state; after a process crash an abandoned pending request becomes retryable after 60 seconds. Retrying a request with different text is rejected.

Explicit local/test AI_PROVIDER=mock displays a permanent SIMULATION ONLY banner and deterministic nonfactual response. The source panel is a labelled synthetic UI preview from the current conversation scope, not actual AI retrieval. Links resolve an exact published version. Hosted production rejects mock configuration. `npm run test:e2e` runs both disabled and mock browser suites sequentially; focused normal tests run with `npm run test:e2e -- tests/e2e/chat.spec.ts`, and the explicit mock suite with `npm run test:e2e -- --config playwright.mock.config.ts`.

## Synthetic demo and regression baseline (M09)

Run `npm run db:seed` after migration. It creates only its reserved synthetic namespace: atlas/boreal organizations, ten members each, 100 published pages each, nested spaces, code/tables, older versions and attributed comments. A repeat run validates and preserves existing demo data. It never deletes unrelated data and rejects hosted/production targets. If the reserved namespace differs, inspect it rather than resetting the database.

Local demo identities are `demo-atlas-0@example.test` through `demo-atlas-9@example.test` and the corresponding `demo-boreal-*` identities. Indices 0/1/2/3 demonstrate Admin/Reviewer/Editor/Reader. The synthetic local-only password is `Synthetic demo passphrase 2026!`. Never reuse these credentials in a hosted environment. Seeded users are explicitly verified demo fixtures; real registration/invitation/reset behavior is independently tested through Mailpit.

`npm run verify:foundation` runs static checks, unit/integration/contracts, both browser configurations, builds, checkpoints, forward migration proof, disposable backup restore, five ordinary authenticated clients and security/advisory checks. Start PostgreSQL/Mailpit, migrate and seed first. It requires full Git history for the M04 upgrade fixture and PostgreSQL client tools (or TKA_POSTGRES_CONTAINER for matching container tools). See docs/BACKUP.md and docs/SECURITY.md. No check substitutes a mock DB or silently succeeds on missing tooling.

The capacity report records one short local run against synthetic data. It is not an SLA, an AI benchmark or a promise of hosted throughput. Synthetic screenshots and machine/config/latency limitations live in docs/evidence. After sign-in, verified users see the organization picker/create form on their account page and can open the dedicated Your organizations view.
