# Team Knowledge Assistant — Codex Milestones and Resume Runbook

Version: 1.0 · 29 October 2026 · Companion: `IMPLEMENTATION_SPEC.md`

## 1. How to start

Create a new local Git repository, place this file at `docs/MILESTONES.md` and the specification at `docs/IMPLEMENTATION_SPEC.md`. Start Codex in that repository with:

> Read docs/IMPLEMENTATION_SPEC.md and docs/MILESTONES.md. Execute foundation milestones M00–M10 in order. First install the root AGENTS.md and durable checkpoint protocol from M00. Implement and verify every subtask, update the task ledger and evidence after each completed subtask, and continue without routine confirmation. Do not provision AWS resources, call a paid model, publish a remote repository, or implement deferred AI milestones. When interrupted, leave a recoverable checkpoint. Never mark unverified work complete.

After M00, the user can type **resume** in a new Codex session opened in the same repository. Root AGENTS.md must make that command sufficient. A new machine still needs the repository, required tools/secrets and any uncommitted checkpoint files; a word alone cannot reconstruct lost disk state or restart an expired runtime automatically.

This document is the authoritative task ledger. Every task starts unchecked. Use `[x]` only with evidence. Record `in_progress`, `blocked` and reasons in `docs/PROGRESS.md`; do not invent extra checkbox states. Dependencies are sequential by milestone unless explicitly independent. Each milestone must implement the actual vertical flow, not placeholder pages.

## 2. Durable execution protocol

### Root AGENTS.md content to install in M00

Copy this block into root AGENTS.md; replace no requirements with vague references:

```markdown
# Codex project operating instructions

Read docs/IMPLEMENTATION_SPEC.md, docs/MILESTONES.md and docs/PROGRESS.md before any implementation. The current task ledger and repository files are authoritative, not chat memory.

When the user says `resume`, `continue`, or equivalent:
1. Read these files and the latest docs/evidence entries. Inspect git status/diff/log and active local processes without discarding any changes.
2. Reconcile the last checkpoint with actual files, migrations and verification. A checkbox alone is not proof. Do not rerun destructive seed/reset commands against an unknown database.
3. Inspect the last in-progress subtask. Reproduce its last failing or focused check; if incomplete, continue it. Reopen claimed completed work when relevant checks fail or evidence does not match its files.
4. Select the first unchecked, unblocked foundation subtask whose dependencies are complete. Implement, verify, record evidence, update the ledger and checkpoint, and continue automatically.
5. Stop only at the completed foundation gate, a genuine blocker requiring unavailable credentials/environment/user decision, or a boundary forbidding the next action. Report the blocker precisely and continue independent authorized work if available.

Authorized scope: local implementation, dependency installation, migrations in the dedicated development/test DB, synthetic seed data, tests, builds, local containers, repository-local documentation, and scoped commits. Preserve pre-existing/user changes. Never use git reset --hard, force-push, delete unrelated files, or reset an unknown database. Do not publish remotely or send real messages. Mailpit is the local mail sink.

Cloud provisioning/destruction, paid model calls and deferred AI milestones are outside the foundation execution scope. Terraform format/validate and offline policy tests are allowed; do not apply. Do not silently bypass platform approvals. Missing tooling is not permission to weaken required verification.

After every verified subtask and before ending: update docs/MILESTONES.md checkboxes, docs/PROGRESS.md, and docs/evidence. Record exact task ID, outcome, relevant files, commands, exit codes, environment, limitations and next action. Redact secrets and sensitive content. Checkpoint in-progress work honestly. Commit completed coherent work when local Git permits; record when commits are unavailable. Never claim a commit or test that did not happen.

Use project verification scripts. Fix relevant failures before marking done. No empty tests, success-on-failure wrappers, skipped required suites, invented screenshots, fake AI claims, or marking cloud work complete after validate alone. Mock AI remains clearly labelled. Use maintained compatible dependencies and lockfiles. Keep org isolation enforced server-side on every resource and future tool.

Use deterministic defaults from the specification for routine choices. Record architecture decisions in docs/DECISIONS.md. Ask only for material unresolved product/cost/security decisions or required credentials. Continue milestones without repeated approval.
```

### Progress/checkpoint file to create

`docs/PROGRESS.md` must always contain:

```markdown
# Execution checkpoint
- Updated at: <UTC timestamp>
- Active release: foundation
- Overall status: not_started | in_progress | blocked | foundation_complete
- Current milestone/subtask: <ID>
- Last completed subtask: <ID or none>
- Last implementation commit: <actual SHA or uncommitted>
- Worktree: <clean or list of intentional changes>
- Last verification: <commands, outcomes, evidence paths>
- Current failure/blocker: <exact symptom and required input, or none>
- Next executable action: <specific command or implementation step>
- Background processes: <purpose/ports; recheck on resume>
- Migration/seed state: <dedicated DB identity without credentials; latest migration>
- Cloud/model spend: not started; no paid actions authorized

## Subtask execution records
| ID | State | Evidence | Notes |
|---|---|---|---|

## Handoff / unfinished work
<file-level notes; no secrets>
```

Maintain one evidence record per milestone at `docs/evidence/Mxx.md`, with subtask sections: requirement, change summary, command(s), timestamp, exit status, test environment, observed result, sanitized artifact paths and limitations. Record the commit under test or relevant file hashes. If only ledger/docs change after a check, say so; application code changes invalidate affected evidence. Avoid raw logs containing passwords, cookies, tokens or mail links.

Checkpoint immediately before risky local migrations and after publication/concurrency/security checks. On abrupt loss there may be no final checkpoint; resume reconciles actual state. Run checkpoints frequently rather than relying on graceful shutdown.

### Verification commands to implement, not merely document

Root npm scripts: `dev`, `build`, `lint`, `typecheck`, `test:unit`, `test:integration`, `test:e2e`, `db:migrate`, `db:seed`, `test:contracts`, `verify:foundation`, `checkpoint:check`. Infrastructure scripts: `infra:validate`, `demo:up`, `demo:down`. Document required services and safe startup/shutdown. `verify:foundation` runs required suites and fails on any error; do not convert missing dependencies into passes.

`checkpoint:check` verifies required docs, task IDs, valid states and evidence references. Implement `scripts/status.mjs` to print the current milestone, first eligible unchecked task and blockers from the ledger, without changing code or fabricating completion. This assists resume; root AGENTS.md governs reasoning and action. Never build a script that blindly runs arbitrary text commands from comments or untrusted content.

## 3. Milestone plan — foundation (execute now)

### M00 — Durable project bootstrap

Depends on: none.

- [ ] M00.01 Create local repository if none exists; inspect existing files first; preserve user changes. Put both source documents in docs without losing scope. Record unavailable remote as deferred, not a blocker to local work.
- [ ] M00.02 Install root AGENTS.md with the protocol above, create docs/PROGRESS.md, docs/DECISIONS.md, docs/evidence/M00.md and stable task IDs.
- [ ] M00.03 Create npm workspace skeleton and packages/apps directories; record concrete framework choices, compatible supported runtime/dependency versions and rationale in ADR-001. Read official docs when resolving current APIs; do not pin guessed versions.
- [ ] M00.04 Add formatting/lint/type configuration, .gitignore, .env.example, README quickstart, lockfile, explicit port conventions, and environment schema. No real secrets in files.
- [ ] M00.05 Implement status/checkpoint scripts and docs-validation tests, including missing progress/evidence and malformed task references. Scripts report current work without auto-marking it complete.
- [ ] M00.06 Perform a resume drill: write a simulated in-progress checkpoint, invoke status, reconcile it, and record the actual next task. Remove fake history; keep drill evidence. Commit bootstrap if available.

Gate: clean dependency install, lint/type bootstrap checks and checkpoint checks pass; an unrelated new session can discover exactly what to do from repository files.

### M01 — Local infrastructure, database, contracts and API skeleton

Depends on: M00.

- [ ] M01.01 Add Compose PostgreSQL and Mailpit services, health checks, named local volumes, separate test database and .env configuration. Provide full-app profile and lightweight host-dev profile. Avoid public DB binding in hosted configurations.
- [ ] M01.02 Build API bootstrap, configuration validation, structured redacted logging, request IDs, consistent errors, safe CORS/origin policy, health/liveness/readiness and graceful shutdown.
- [ ] M01.03 Create initial migrations for identity/organizations, then knowledge/jobs/chat entities as needed by later tasks. Add composite tenant keys/indexes, constraints and transactional migration discipline. Document DB invariants before writing dependent routes.
- [ ] M01.04 Establish shared contracts/OpenAPI and typed web API client; request validation and pagination/error schemas. Reject unknown/oversized or malformed input consistently.
- [ ] M01.05 Implement central capability policy and organization-scoped repository/query helpers; test role matrix and unknown role denial. Do not accept client org/user context as trusted.
- [ ] M01.06 Add real PostgreSQL integration harness with disposable isolated data, clock/token helpers, SMTP test sink and deterministic fixtures. Prevent tests/seed from targeting a non-test DB accidentally.
- [ ] M01.07 Build web shell, routing, query client, design tokens, accessible components and generic loading/error/empty states; proxy API locally.

Gate: containers healthy; readiness changes correctly with DB availability; migrations work from empty DB; OpenAPI loads; policy unit tests and initial API integration checks pass.

### M02 — Authentication end to end

Depends on: M01.

- [ ] M02.01 Implement registration, email normalization, display name/password validation and secure hashing. Never return password hashes. Duplicate registration avoids unnecessary identity disclosure.
- [ ] M02.02 Implement verification issue/resend/consume with hashed, expiring, single-use tokens and transactional consumption; send via Mailpit adapter. Block organization actions before verification.
- [ ] M02.03 Implement login/logout/me, PostgreSQL session storage, expiry/revocation, secure cookies, CSRF bootstrap/protection, origin checks and rate limits. Rate-limit configuration must remain correct if API scales; use shared persistence or document/enforce single-instance demo limitation.
- [ ] M02.04 Implement forgot/reset-password with generic responses, token expiry, one-time use, earlier-token invalidation and session revocation after reset.
- [ ] M02.05 Build registration/login/verification/resend/forgot/reset screens, signed-in route guard and session-expired UX. Local Mailpit instructions must enable complete manual flow without copied secrets in logs.
- [ ] M02.06 Add negative integration tests: invalid/expired/reused token, wrong password, unverified access, cookie policy, CSRF rejection, reset session invalidation and throttling. Verify sensitive logs are redacted.
- [ ] M02.07 Add real browser tests for registration through inbox verification, login/logout, reset and expired session recovery.

Gate: authentication works from UI and API using actual mail sink and DB; no mocked authentication in security evidence.

### M03 — Organizations, invitations and roles

Depends on: M02.

- [ ] M03.01 Implement organization create/list/update and membership uniqueness. Creation atomically installs first Admin.
- [ ] M03.02 Implement invite create/list/revoke/resend/inspect/accept; exact verified email match, selected role, expiry, replay and duplicate acceptance protections. Tokens never exposed by member listing.
- [ ] M03.03 Implement member directory, role changes/removal, last-Admin protection under concurrent changes and immediate membership revalidation on requests. Restrict admin actions server-side.
- [ ] M03.04 Build create/select organization, organization switcher, members/invitations/settings UI with role-appropriate controls and clear failures.
- [ ] M03.05 Clear tenant-specific web caches and active conversation on organization switch; isolate query keys by organization/user. Test a user with different roles across two organizations.
- [ ] M03.06 Test unauthorized organization IDs, invite email mismatch/expiry/revocation, concurrent final-Admin changes, revoked member session, Reader modifying role, and enumeration leakage.

Gate: two organizations are usable, memberships independent, invitations work via Mailpit, forged cross-org requests fail and last-Admin invariant holds.

### M04 — Spaces, hierarchy and rich-text drafts

Depends on: M03.

- [ ] M04.01 Implement space creation/list/update and page tree with bounded child pagination, stable ordering and tenant-safe relationships. No per-space ACL settings.
- [ ] M04.02 Implement unpublished page creation/shared draft read/save with expected revision, server-side editor schema validation, text extraction and size limits.
- [ ] M04.03 Integrate existing rich editor: headings, lists, emphasis, links, tables, code blocks. Sanitize render and reject unsafe URLs/nodes. No image/embed upload UI.
- [ ] M04.04 Build tree navigation and page editor: explicit Save, debounced autosave, saved/error indicator, dirty navigation warning and page metadata. Preserve current unsaved edits after network/409 errors.
- [ ] M04.05 Implement move within space with cycle/depth prevention and optimistic concurrency. Do not expose unpublished draft titles/body in Reader/Reviewer responses/tree/search.
- [ ] M04.06 Add concurrent save test: two editors load same revision, first succeeds, second receives 409 and can recover without data loss. Test cross-tenant parent/space ID and malicious rich text.

Gate: authorized authors can create/edit nested technical pages; read-only members cannot discover drafts; code/table content renders safely; stale edits never silently overwrite.

### M05 — Publication, immutable history, archive and manual search

Depends on: M04.

- [ ] M05.01 Implement publish transaction: expected draft revision, immutable version, incremented version number, latest pointer, audit entry and deduplicated outbox event. Add publication idempotency.
- [ ] M05.02 Build Reader published page view, creator/publisher metadata and version history/detail/diff. Draft changes leave published content unchanged.
- [ ] M05.03 Implement exact-version route and citation resolver with authorization and changed/archived labels; resolve only valid tenant-owned page/version combinations.
- [ ] M05.04 Implement page-subtree and space archive/restore, preserving versions and preventing inaccessible-parent restores. Immediately exclude from normal lists/search/future retrieval; no hard delete.
- [ ] M05.05 Implement PostgreSQL full-text search over current published titles/body, optional space filter, pagination, escaped snippets and useful empty states. New publication updates ordinary search independently of AI.
- [ ] M05.06 Test two publications/history immutability, duplicate publish, publish/save race, archive subtree, restore parent constraints, search injection, draft leakage, revoked-member history and cross-org version URLs.
- [ ] M05.07 Browser flow: Editor drafts/publishes, Reader sees version 1 while version 2 is draft, then sees version 2; historical version 1 remains accessible and labelled correctly.

Gate: full author-to-reader lifecycle works; exact-version evidence survives new publications; search works without AI; published states and outbox are transactionally consistent.

### M06 — Page-level comments and provenance

Depends on: M05.

- [ ] M06.01 Implement flat paginated comments on published pages, immutable revisions, page-version-at-post metadata and safe author timestamps.
- [ ] M06.02 Enforce Reader read-only, Reviewer+ create, own edit/delete and Admin moderation. Use expected revision; tombstone deletion and preserve safe audit metadata.
- [ ] M06.03 Build bottom-of-page comments, own edit/delete controls, Admin moderation and historical-version warning. No inline comments/replies/approval controls.
- [ ] M06.04 Emit revisioned comment indexing events and invalidate deleted/edited comment eligibility. Define historical tombstone citation behavior without leaking removed text.
- [ ] M06.05 Test role matrix, other-author edits, cross-org comment IDs, revision conflicts, safe rendering, archived page policy and removed-member author display.

Gate: comments function as separate attributed advice; correct access and revision semantics are demonstrated by API and browser tests.

### M07 — Durable jobs and model-neutral AI contracts

Depends on: M05 and M06.

- [ ] M07.01 Implement outbox dispatcher and PostgreSQL durable worker with dedupe key, bounded retries/backoff, lease/heartbeat, graceful shutdown and expired-lease recovery. Use deterministic test clocks where possible.
- [ ] M07.02 Implement per-source version/index-generation states and eligibility predicate. Publication supersedes previous retrieval immediately; old jobs cannot ready a newer source.
- [ ] M07.03 Add fake adapter tests for success, transient failure, terminal failure, duplicate delivery, stale completion and crash/reclaim. Fake completion must not mark real AI indexing as ready in app configuration.
- [ ] M07.04 Define shared IndexSource/Retrieve/AnswerRequest/AnswerEvent/AnswerResult/Citation schemas and internal authenticated service boundary. Add Python-service README/OpenAPI contract stub, not a model implementation.
- [ ] M07.05 Implement disabled/mock provider ports with zero paid calls; mock mode only in explicit dev/test config. Reject mock mode in hosted production configuration. Validate exact source IDs and organization scope on mock fixtures.
- [ ] M07.06 Expose safe index status and Editor/Admin retry actions; UI labels awaiting-provider accurately. Publish remains successful even when optional AI is unavailable.
- [ ] M07.07 Test publish/edit/comment-delete/archive races, restart recovery and service disabled readiness. Record how future AI attaches without changing public web contracts.

Gate: durable state machines and contracts work with honest disabled behavior; no embeddings, semantic retrieval, Bedrock or MCP advertised as implemented.

### M08 — Chat shell and conversation isolation

Depends on: M03, M05, M07.

- [ ] M08.01 Implement owner-private conversations/messages, organization scope and optional fixed space scope; list/create/history/delete. Admins cannot inspect others' chats by default.
- [ ] M08.02 Build chat UI with organization-wide default, space selection before creation, persistent history, pending/error/retry/cancel states and source panel rendering.
- [ ] M08.03 Implement message request ID/idempotency, disabled-provider response, mock stream contract, disconnect handling and scoped source links. Conversation retry cannot create duplicate assistant messages.
- [ ] M08.04 Show permanent simulation banner for mocks; disabled mode clearly states AI is not connected. No fabricated factual answer or false Ready state.
- [ ] M08.05 Test direct cross-user conversation/message IDs (same org and different org), mismatched space, changed membership, switched organization, cancellation and stream errors.
- [ ] M08.06 Browser-test disabled and deterministic mock flows, source-version navigation and isolation after switching organizations.

Gate: frontend/backend chat plumbing is complete and honest; no real model required. Real AI feature acceptance remains pending.

### M09 — Security, regression, backup and capacity baseline

Depends on: M02–M08.

- [ ] M09.01 Create repeatable seed: 2 organizations, 10 members each with all roles, 100 synthetic published pages each, nested spaces, architecture/API/setup examples, conflicting docs, optional/missing contacts and attributed comments. Synthetic users/credentials local-only.
- [ ] M09.02 Complete endpoint-wide tenant isolation matrix for spaces/pages/drafts/versions/comments/jobs/search/conversations; test forged IDs and role revocation with active session.
- [ ] M09.03 Apply security headers/CSP, CSRF protections, SQL parameterization, sanitization, secret scanning and safe logs. Review dependency advisories using available tooling; document actionable findings and fixes.
- [ ] M09.04 Add audit coverage for administrative changes, publication, archives and moderation. Exclude secrets/body contents; verify actor/org/request traceability.
- [ ] M09.05 Implement backup/restore runbook and demonstrate restore into a disposable DB, including versions and memberships. Test migration from empty DB and forward upgrade from prior schema fixture.
- [ ] M09.06 Run browser end-to-end golden journey covering both organizations, roles, publish/history/comments/search/chat shell, invites/reset. Capture sanitized screenshots only for synthetic test data.
- [ ] M09.07 Run five concurrent ordinary authenticated clients against seeded data; record latency/error counts, machine/config, DB query behavior and limitations. Fix unbounded lists/N+1 issues. Do not describe this as AI concurrency validation.
- [ ] M09.08 Implement verify:foundation aggregate and CI: install, lint, typecheck, unit/integration/contracts/browser/build and migration checks using PostgreSQL/Mailpit service containers. No paid AWS credentials in CI.

Gate: zero known tenant leaks, required regressions pass, backup restored, measured local baseline documented, clean verification command completes without skipped required suites.

### M10 — Packaging, AWS definitions and foundation handoff

Depends on: M09.

- [ ] M10.01 Add production multi-stage container builds, non-root processes where feasible, same-origin reverse proxy, health checks and Compose hosted profile. Never publish PostgreSQL externally.
- [ ] M10.02 Implement Terraform for isolated, short-lived validation deployment with configurable region/instance/lifetime, tags and scoped state. Default design excludes NAT gateway/load balancer/RDS/Kubernetes; no resource creation now.
- [ ] M10.03 Define least-privilege permissions, secret injection, HTTPS prerequisite, data volume/backup approach, no auto-start paid model calls, and optional Bedrock attachment contract. Do not include working secrets in examples.
- [ ] M10.04 Add fmt/validate and offline policy tests for network exposure, encryption where applicable, project tags and absence of prohibited costly components. Record checks actually possible without cloud credentials; blockers remain explicit.
- [ ] M10.05 Write deploy/smoke/backup/destroy/residual-resource inventory runbook with explicit paid-action gate, maximum test duration, configurable cleanup and cost-estimate worksheet. No exact AWS price claims without current official evidence. Budget alerts are not a hard cap.
- [ ] M10.06 Document scaling path (API replicas, independent workers, pooled DB/managed DB later, index growth), single-node availability limitations, future connectors/ACLs and deferred AI page drafting.
- [ ] M10.07 Verify from a clean checkout/clean disposable environment: install, start dependencies, migrate, seed, run app, run verify:foundation and container smoke. Validate all README commands; record actual results.
- [ ] M10.08 Final scope audit against IMPLEMENTATION_SPEC: map requirements to routes/UI/tests, list deferred vs blocked vs complete, update OpenAPI/ADRs/progress. No incomplete foundation subtask may be hidden by declaring overall complete.
- [ ] M10.09 Perform final resume drill: interrupt an innocuous local check, reopen using repository instructions, reconcile checkpoint, rerun affected check and finish without chat memory. Record proof and limitations.
- [ ] M10.10 Mark foundation_complete only after all required gates. Provide concise handoff with verification commands, evidence, limitations and next AI milestone. Do not begin M11 automatically.

Gate: ready-to-attach foundation delivered, cloud definitions validated as available, no claim of deployed AWS or functioning real AI. Record any missing tool credential/environment check as blocked, not passed.

## 4. Later milestones — specify now, execute only after user starts AI phase

### M11 — Bedrock/embedding feasibility and ingestion

Depends on: foundation complete + explicit AI-phase instruction + AWS account/region/model access + budget check.

- [ ] M11.01 Verify official Bedrock model availability, current pricing/data handling/region terms and total INR 500 budget including deployment; document approved configuration and small token/request caps. No guessed claims of privacy or free access.
- [ ] M11.02 Implement Python service with service authentication, Bedrock adapter and local stub fallback, bounded timeout/concurrency and redacted logs. AWS credentials remain backend-only.
- [ ] M11.03 Choose embedding provider inside approved boundary; implement text chunking retaining heading/code/table context, deterministic IDs, tenant/source version metadata, pgvector migrations if selected and index-generation lifecycle.
- [ ] M11.04 Process page/comment jobs idempotently; exclude stale/archived/deleted sources; test failed job recovery, reindex and race handling with deterministic fixtures.
- [ ] M11.05 Benchmark a small paid sample only within authorized cost envelope; report real quality/latency/cost and decide feasibility before expanding.

Gate: actual indexed authorized content, measured feasibility and no stale/tenant leakage. If budget/model access blocks this, record blocker instead of substituting an unapproved provider.

### M12 — Grounded RAG and real chat

- [ ] M12.01 Implement hybrid/semantic retrieval as justified by evaluation, mandatory tenant/space constraints, latest-version eligibility and source authorization.
- [ ] M12.02 Implement grounded answers, structured citation validation, partial/insufficient/conflicting evidence handling, comment attribution and unknown-owner fallback.
- [ ] M12.03 Connect real streaming chat, safe conversation context limits/cancellation, honest error recovery and provider usage accounting. No hidden chain-of-thought displayed.
- [ ] M12.04 Add stale-index/source mutation/revocation tests during retrieval/generation; do not return unauthorized evidence after scope changes.
- [ ] M12.05 Run foundational RAG evaluation before enabling agent behavior; preserve exact-version source verification in UI.

Gate: answers are actual grounded outputs with resolvable citations; no invented owner, authoritative comment promotion or cross-tenant sources.

### M13 — MCP, two skills and one bounded agent

- [ ] M13.01 Implement authenticated read-only MCP knowledge search/read service using current official SDK; enforce trusted org/user scope separately from model arguments.
- [ ] M13.02 Implement technical-Q&A and developer-onboarding instruction/resource bundles, versioned and loaded by explicit selection or bounded routing. No release/task skills.
- [ ] M13.03 Implement one agent loop with tool/schema validation, 6-call/2-retrieval/60-second initial limits, cancellation and safe tool trace metadata.
- [ ] M13.04 Test malicious page instructions, fake tenant IDs, tool errors/timeouts, invalid arguments, excessive loops and no-evidence cases; maintain backend permissions.
- [ ] M13.05 Verify onboarding assembles cited setup steps/contacts/gaps, rather than inventing steps or executing external actions.

Gate: tool/skill/agent/MCP behavior demonstrated with reproducible traces and permissions; no mutation tools.

### M14 — AI evaluation and brief AWS validation

- [ ] M14.01 Build at least 30 labelled synthetic evaluation cases and expected sources/evidence behaviors. Separate deterministic security tests from probabilistic answer scoring.
- [ ] M14.02 Measure retrieval recall@k, citation support/validity, abstention/conflict handling, tool limits, latency/token usage; publish dataset/run config/results and failures. Fix material failures; zero tenant disclosure mandatory.
- [ ] M14.03 Measure five simultaneous AI conversations with configured admission limits; queue/reject honestly when capacity is exceeded. Record observed throughput rather than promise it.
- [ ] M14.04 Reconfirm account/region, accumulated spend, current prices, conservative test-window estimate, cleanup ownership and explicit deployment authorization. Abort if not demonstrably within remaining budget.
- [ ] M14.05 Deploy, run synthetic end-to-end auth/knowledge/AI smoke checks through HTTPS, record sanitized evidence and limitations. Verify real email constraints honestly.
- [ ] M14.06 Export permitted evidence/backups, destroy only project resources, inspect disks/IPs/logs/state artifacts and record remaining charges/resources. Do not equate VM stop with teardown.
- [ ] M14.07 Final portfolio handoff: architecture, demo recording instructions, measured evaluation/security/capacity evidence, reproducible local setup/deployment and limitations. Update ledger and progress.

Gate: actual verified AWS run and teardown, or clearly documented blocked cloud validation; no invented deployment/performance claims.

## 5. Completion rules and blocker handling

A subtask is done only when implementation, relevant tests, docs and evidence agree. A milestone is done only when every required subtask and its gate passes. Update checkboxes only after checking outputs. A dependency can be bypassed only with a documented reason that does not invalidate the dependent gate.

Examples:
- Browser unavailable: install supported tooling if possible; otherwise mark browser verification blocked. Do not substitute an HTML inspection for a browser pass.
- SMTP credentials absent: foundation uses Mailpit and continues. Real hosted mail remains deferred/configuration dependent.
- AWS credentials absent: continue local and infrastructure validation; do not block foundation on an unauthorized cloud apply.
- Actual test failure: fix cause and rerun focused checks; do not weaken the requirement/test to make the ledger green.
- User code changes between sessions: preserve them, inspect scope, rerun affected checks, update checkpoint. Ask only when resolving genuine conflicts risks overwriting their work.
- Disconnection mid-migration: inspect migration table/schema before retry; never blindly reset data.
- Resume after foundation_complete: report completion and next gated AI milestone; do not incur cost because the user merely typed resume.

Every end-of-session response should state completed IDs, current blocker if any, latest verification and the next executable step. The durable files must contain the detailed handoff so a disconnected session does not require the prior response.
