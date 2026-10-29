# Team Knowledge Assistant — Implementation Specification

Version: 1.0 · Date: 29 October 2026 · Status: agreed scope plus explicit implementation defaults

## 1. Purpose and authority

Build a finished, multi-organization technical knowledge application. New developers use it to onboard; existing developers use it to understand and operate unfamiliar services. Knowledge includes setup/run instructions, architecture, API endpoints, team structure, project information, and optional contacts. Users author knowledge; later AI retrieves evidence and answers questions. This is not a task tracker.

This document is the requirements authority. `MILESTONES.md` is the execution and verification ledger. Keep both existing documents at repository root; durable evidence belongs in `docs/evidence/`. Codex must create the root `AGENTS.md` and progress files exactly as directed in the milestone document before implementing application code. No unseen chat history is needed to execute this plan.

Precedence: latest explicit user instruction > repository AGENTS.md within its scope/platform rules > this specification > milestone implementation defaults. Resolve contradictions by recording a decision; never silently discard a requirement. Label any material scope change and obtain direction when it changes user-visible behavior, incurs cost, or weakens security. Routine library and UI choices are delegated to Codex.

## 2. Delivery boundaries

### Foundation release — implement now

A complete frontend, API, authentication, organization management, knowledge authoring, comments, published history, background job framework, manual search, chat shell, test suite, CI, local containers, and validated AWS infrastructure definitions. Model and agent attachment is a separate later stage. The foundation must run without AWS credentials, model access, or paid services.

### AI release — planned, not authorized for implementation in the foundation run

Python AI service, actual embeddings/indexing, RAG, Bedrock answer generation, citation grounding, read-only MCP, two skills, bounded agent, evaluation and five-conversation validation. Define contracts now; implement these milestones only when the user explicitly starts the AI stage. Do not pretend a simulated index or mock answer is actual AI functionality.

### Constraints

- Four-week target; available engineering hours are unknown. Milestones and quality gates govern completion; do not claim a guaranteed schedule.
- New repository. Do not invent a remote URL or create a remote repository without an available authorized destination. Local Git setup and commits are permitted; verified commits to the existing origin/develop are explicitly authorized by the execution workflow. Creating a different remote remains a separate step.
- React/TypeScript web, Node.js/TypeScript API, PostgreSQL, Docker Compose, Terraform, GitHub Actions; separate Python AI service later.
- Develop/test locally first. User laptop: ASUS, approximately 8 GB RAM. Do not require a local LLM or heavyweight orchestration.
- Total AWS and model testing budget: INR 500, not per month. No continuous hosting. Paid provisioning and model calls are deferred.
- Bedrock is an accepted managed-model boundary in the user's AWS environment. Other model APIs require a new decision. Do not state that Bedrock means data never leaves a VPC or has universal retention guarantees; verify selected model/region/features before use.
- Synthetic demo content only; never import real employer data or secrets.
- Validation dataset: 2 organizations, 10 members each, 100 published pages per organization. Five simultaneous AI conversations is a later measured target, not an unproven capacity claim.
- Design for future horizontal growth; do not add Kubernetes, multi-agent systems, or paid managed infrastructure for speculative scale.

## 3. Scope exclusions and extension points

Not in MVP: tasks/Jira-like tracking, release readiness, incident workflows, AI writing/editing pages, AI mutations/approval flows, uploads/attachments/images, imported documents, Confluence integrations, enterprise SSO/AD groups, page/space ACLs, inline comments, formal content approval, billing, mobile application, persistent saved preferences, notifications beyond authentication/invitation mail, collaborative live editing.

Future recommendations: AI page drafts/proposed edits reviewed and explicitly published by an Editor; external source adapters preserving source identity/hierarchy/authorship/permissions; fine-grained scoped grants and identity groups; additional skills. Do not implement empty feature screens or invented task capabilities.

## 4. Product behavior

### 4.1 Identity and membership

Users register with name, email and password. Email verification is required before creating/joining organizations or accessing organization data. Sign-in, sign-out, resend verification, forgot password, reset password and session expiry must work. Normalize email case for identity matching. Do not disclose account existence in reset/resend responses.

Defaults: password minimum 12 characters; accept passphrases, maximum 128 characters; hash using a maintained password-hashing library with suitable parameters. One-time verification/reset/invite tokens use cryptographically random values, are hashed at rest and redacted from logs. Verification expires in 24 hours, reset in 30 minutes, invitations in 7 days. Resend invalidates earlier tokens of that purpose. Reset revokes existing sessions. Authentication and mail endpoints are rate limited.

Use opaque server-side sessions, with hashed tokens stored in PostgreSQL. Cookies: HttpOnly, SameSite=Lax, Secure in hosted mode; local development can use insecure HTTP cookies. Default session lifetime 7 days. Protect cookie-authenticated mutations using CSRF tokens plus origin checks. Never store credentials or session tokens in browser localStorage. Exact limits/hash parameters are configurable and documented.

Local mail uses Mailpit: verification, reset and invitation messages appear in its inbox, not production logs. Define an SMTP adapter so hosted mail can be attached later. AWS deployment must not claim working real email without configured delivery; sandbox/restricted mail limitations are documented. No real emails are sent during automated tests.

Any verified user can create an organization and becomes its Admin. Existing organizations are invite-only. An Admin invites an email and selects its role. Recipient signs in/registers with that exact verified email before accepting. Invite acceptance is single-use and transactional; duplicates do not create duplicate memberships. Admin can revoke/resend outstanding invitations. No domain auto-join.

A user can belong to several organizations, with a separate role in each. Organization selection is explicit in URLs/API scope. There is no global role granting implicit cross-organization access. An Admin may change roles/remove members. Never permit removing/demoting the last Admin. Removal invalidates access on the next request, including existing sessions/streams where feasible; server authorization cannot depend solely on a stale session claim. No account deletion or organization deletion workflow in foundation; document as deferred.

### 4.2 Permission matrix

| Capability | Reader | Reviewer | Editor | Admin |
|---|---|---|---|---|
| Read published pages/history, creator metadata, organization members directory | Yes | Yes | Yes | Yes |
| Search published content and use own chat | Yes | Yes | Yes | Yes |
| Add page-level comments | No | Yes | Yes | Yes |
| Edit/delete own comment | No | Yes | Yes | Yes |
| Moderate another person's comment | No | No | No | Yes |
| View current shared drafts; create/edit/publish pages | No | No | Yes | Yes |
| Create/rename/archive spaces; move/archive/restore pages | No | No | Yes | Yes |
| Manage members/invitations/settings | No | No | No | Yes |
| Access another user's private chat | No | No | No | No |

Organization-wide access only. All published spaces/pages in that organization are readable to every member. Centralize authorization behind capability checks taking actor, organization and resource; do not scatter role-name comparisons through controllers. Future space/page/group policies must be attachable without rewriting retrieval or UI. Current source metadata must not grant permissions automatically.

### 4.3 Spaces and page authoring

Organization has named spaces (name and optional description), each with a nested page tree. Pages have a title, optional parent, rich-text body, creator and timestamps. Rich editor uses an existing component (default Tiptap), with paragraphs, headings, bold/italic, lists, links, tables and fenced/code blocks. No custom editor engine, embedded scripts, image uploads, arbitrary HTML or external embeds.

Defaults: organization name 2–100 characters, space name 1–100, page title 1–200, extracted page text max 100,000 characters, comment max 5,000, tree max depth 10. Validate document schema and total request size server-side. A published page needs a nonblank title and body. Store editor JSON and deterministic extracted text; render a sanitized representation. Links allow safe protocols only.

Pages start unpublished. Save drafts automatically with a short debounce and an explicit Save button/status (Saving/Saved/Error). One shared draft per page, editable by any Editor/Admin; no private draft product feature. All Editors/Admins can see unpublished pages and drafts; Readers/Reviewers cannot. API must not serialize draft body/title to read-only callers, including tree/search endpoints.

Optimistic concurrency uses revision/ETag. A stale save/publish returns 409 with recovery guidance; do not silently overwrite another editor's work. Preserve unsaved text in the current editor during recovery. Publish is an explicit action, not an approval workflow. It atomically snapshots title/body/parent metadata into immutable next version, marks the published pointer, and emits a versioned indexing event. Publishing twice with the same idempotency key must not create duplicate versions.

Page creator is distinct from service owner and last editor/publisher. Show creator, current publisher, creation/publication dates and indexing status. Preserve original creator through edits and member removal (safe former-member label if needed).

Page moves stay within a space for foundation, reject cycles/depth violations. Cross-space moves are deferred. Archiving a page archives its descendants transactionally, removes them from ordinary navigation/search/AI eligibility, and preserves history. Restore requires an active parent or explicit move to the space root; then follows indexing lifecycle. Space archive hides all its content; unarchive restores visibility subject to individual page archive flags. No hard deletion UI. Existing citations to archived content open an authorized historical view labelled Archived, but cannot enter new retrieval.

### 4.4 Publishing and history

Published versions are immutable and monotonically numbered per page. Editing creates/updates the shared draft without altering the last published version. Readers and future AI see published content only. History lists version, publisher and time. Historical view supports an exact version URL. A plain-text diff between selected versions is sufficient; no restore-old-version action required for foundation.

Citation identity is page ID + published version ID + text locator, never a floating latest-page URL. When viewing an older cited version show a link to current published version and indicate that it has changed. Authorization is checked at access time; an old citation does not bypass membership revocation. Historical titles/bodies remain scoped to their organization.

### 4.5 Comments

Flat chronological page-level comments at bottom of a published page; no inline anchors or replies. Reviewer/Editor/Admin may add, edit their own, and soft-delete their own. Admin may moderate any comment. Reader can read. Paginate comments. Record author, created/edited time, revision, and published version current when posted. Editing preserves immutable comment revisions so future citations remain reproducible. Soft deletion/moderation tombstones the comment and excludes it from new AI use; historical reference shows unavailable content rather than deleted body.

Comments are advice, not authoritative page text. They may be relevant to an older version; never imply automatic applicability to latest content. The later AI may use relevant comments with author/date/version attribution, identify speculation, and surface disagreement. It must not silently resolve a page/comment conflict or promote a risky workaround to a confirmed instruction.

### 4.6 Navigation and manual search

After sign-in, show organization picker/create organization. Main app: organization switcher, spaces and page tree, page content with comments/history/edit actions as authorized, Search and Chat. Organization settings include members, invitations and organization name. Provide loading, empty, invalid-link, forbidden, not-found and retryable error states. Desktop-first responsive layout, usable keyboard navigation, labelled controls and visible focus; narrow screens use collapsible navigation.

Manual search uses PostgreSQL full-text search over latest published titles/text, organization filtered with optional space scope, pagination and escaped snippets. It works without the AI service and reflects latest publication. It excludes drafts/archived content. Label manual search separately from AI retrieval; AI indexing eligibility does not suppress the user's ordinary page search.

## 5. Foundation architecture and defaults

These concrete defaults avoid repeated implementation questions. At bootstrap verify current official documentation, compatible releases and advisories; pin versions in lockfiles and record an ADR. Do not substitute an unfamiliar framework without need.

- Monorepo: npm workspaces; supported Node LTS compatible with available local Node 22 where feasible. React + Vite + React Router + TanStack Query. API Fastify with TypeScript, Zod validation, Prisma migrations/client; PostgreSQL. Tiptap rich text. Vitest, API integration tests against real PostgreSQL, Playwright browser tests. Python service later uses FastAPI with pinned dependencies.
- `apps/web`, `apps/api`, `packages/contracts`, `packages/config`, `services/ai`, `infra/terraform`, `infra/compose`, `scripts`, `docs`, `docs/evidence`, `.github/workflows`.
- Web and API behind one origin/reverse proxy in hosted mode; Vite proxy locally. Only API accesses the application database; browser never receives DB credentials.
- API stateless except PostgreSQL-backed sessions; background worker is a separate process using durable PostgreSQL jobs/outbox to avoid Redis for this demo. No unbounded in-memory work queue.
- Later Python service is private/internal; browser cannot call it directly. API supplies authenticated tenant context through service-authenticated requests, never arbitrary browser headers. Worker/service may claim jobs via an API contract; do not create overlapping independent writers to the same schema without an ADR.
- Future model adapters configurable; foundation provider is `disabled` or `mock` only. No network model call or AWS SDK credential lookup at startup.
- Correlation/request IDs, structured logs, health/liveness and readiness endpoints. Readiness checks DB; optional AI unavailability does not break core knowledge readiness.
- Default local containers: PostgreSQL and Mailpit; app can run on host or via Compose full profile. No local model. Keep worker concurrency low and document memory use.

## 6. Data model requirements

Use UUID identifiers, UTC timestamps, explicit foreign keys and indexes. Every tenant-owned row has organization_id or a proven tenant-anchored composite relationship. Prefer composite tenant foreign keys/uniqueness so a page cannot point into another organization's space. Never trust possession of a UUID as authorization.

| Entity | Required fields/invariants |
|---|---|
| User | id, normalized unique email, display name, password hash, verified_at |
| Session | hashed token, user_id, expiry, revoked_at; indexes for cleanup |
| AuthToken | purpose, user/email, token hash, expires_at, consumed_at |
| Organization | id, name, creator_id, timestamps |
| Membership | organization_id + user_id unique, role, timestamps |
| Invitation | organization_id, normalized email, role, token hash, inviter, expiry, state |
| Space | organization_id, name, description, archived_at |
| Page | organization_id, space_id, parent_id, creator_id, published_version_id, archive state |
| PageDraft | page_id unique, editor JSON/text/title, revision, updated_by/time |
| PageVersion | organization_id/page_id, version number unique, immutable title/body/text/metadata, publisher/time |
| Comment | organization_id/page_id, author, original page_version_id, current revision, tombstone |
| CommentRevision | immutable text/revision/author/times for source citations |
| Outbox/Job | tenant, source type/id/version, kind, state, attempts, dedupe key, lease, next attempt, safe error |
| IndexState | source + version + index generation, status, indexed_at, safe error; actual eligibility computed against latest source |
| Conversation | organization_id, owner_user_id, optional space_id, title, timestamps |
| Message | conversation, role, content, request state, provider mode, citations, timestamps |
| AuditEvent | tenant, actor, action, resource ID, safe metadata, correlation ID/time |

Index organization_id and frequently filtered foreign keys; paginate collections. Full-text indexes for published search. Future embedding/chunk tables belong to the AI stage and must preserve organization, source version and index generation. Do not install an unused vector database during foundation.

## 7. API contract

Version prefix `/api/v1`. Publish machine-readable OpenAPI and shared request/response schemas. All collection routes paginate with a bounded limit (default 20, max 100); page tree may use lazy child loading. Error body: `{code,message,requestId,fieldErrors?}`. Never return stack traces/secrets. Use 401 for unauthenticated, 403 for authorized tenant member lacking capability, 404 for inaccessible cross-tenant resource, 409 for revision/invariant conflict, 422 or consistently documented 400 for invalid input, 429 for throttling, 503 for disabled/unavailable provider.

Required route groups (exact spelling may be consistently adjusted in OpenAPI):

- `/auth/register`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/me`, CSRF bootstrap.
- `/organizations`: list/create; `/:orgId`: view/update; `/:orgId/members`: list/change role/remove; `/:orgId/invitations`: create/list/revoke/resend; invitation inspect/accept endpoint checks signed-in verified email.
- `/:orgId/spaces`: list/create/detail/update/archive/restore; page-tree children endpoint.
- `/:orgId/pages`: create; `/:pageId`: published read/metadata; `/draft`: authorized read/save with expected revision; `/publish`: expected draft revision + idempotency key; `/versions`: list/detail/diff; `/move`, `/archive`, `/restore`.
- `/:orgId/pages/:pageId/comments`: list/create; `/:commentId`: edit with revision/delete.
- `/:orgId/search`: query + optional space + pagination; `/:orgId/index-status`: source/job status; authorized source retry route.
- `/:orgId/conversations`: owner-scoped list/create/read/delete; `/messages`: list/create; response stream endpoint or SSE transport. Delete removes private conversation from history; no model-memory claim.
- `/health/live`, `/health/ready`; internal authenticated job/retrieval interfaces documented separately.

Require CSRF on all cookie-authenticated mutations. Mutations accept expected revisions where concurrent changes matter. Commit content plus outbox atomically. API tests must demonstrate forged orgId, parentId, pageId, spaceId, conversationId and commentId cannot bypass isolation.

## 8. Jobs, indexing and AI attachment contract

On publish, invalidate prior AI eligibility immediately and enqueue source-version work in the same transaction. No new AI answer may rely on superseded chunks. Latest page remains readable/manual-searchable while indexing. State machine: `awaiting_provider` (foundation only), `queued`, `processing`, `ready`, `failed`, `superseded`, `excluded`. Actual worker retries transient failures up to three attempts with backoff; uses leases/heartbeat and can reclaim expired leases. Duplicate delivery is safe. An old job finishing after a new publish must never mark the new version ready.

Foundation must test job claims/deduplication/recovery with a fake adapter. Display `AI not connected`/`Awaiting AI setup`, not Ready, when only a fake adapter ran. Production configuration cannot enable mock accidentally. AI failures never roll back a successful page publish.

Comments create revisioned indexing work; edits/removal invalidate affected comment retrieval immediately. Member revocation and scope restrictions are enforced at read/tool time, not only at indexing time. Failed jobs show safe status and an Editor/Admin retry action; no raw provider payload in UI.

### Provider-neutral contracts to define and contract-test now

- `IndexSource`: orgId, sourceType(page/comment), sourceId, sourceVersionId, pageId, pageVersionId, text, safe metadata, generation, requestId.
- `Retrieve`: trusted actor/org scope, optional space, query, maxResults. Returns authorized source excerpts with exact version/locator, relevance signal and source type; no unsupported probability claims.
- `AnswerRequest`: conversationId, trusted org/user context, optional space scope, question, bounded prior turns, requestId.
- `AnswerEvent`: started, progress (safe), text_delta, citation, completed, failed; support cancellation/timeout/disconnection without duplicate messages.
- `Citation`: sourceType, pageId, pageVersionId, optional commentId/commentRevisionId, locator, source label, author/date when relevant. Server resolves and authorizes source URLs; model cannot invent arbitrary trusted URLs.
- `AnswerResult`: answer, citations, evidenceStatus (`supported|partial|insufficient|conflicting`), warnings, usage/timing when provided.

Chat foundation: private conversation history, organization scope, optional fixed space per conversation, pending/cancel/error/retry states. Switching organization clears active chat view and query caches; backend remains authoritative. Disabled mode returns a clear setup message without fake factual answers. Test-only/development mock mode has a persistent `Simulated response — AI not connected` banner and deterministic fixture citations. Never insert fabricated real citations. No claim that published pages have been semantically indexed.

## 9. Later AI behavior — acceptance requirements preserved

- Default chat searches all accessible published knowledge in current organization; user may choose one space. Never search another organization or carry its conversation context into a new one.
- Answer technical questions and assemble cited onboarding steps; one agent, two versioned instruction bundles: technical Q&A and developer onboarding. A skill is instructions/resources; a tool is callable capability; MCP exposes read-only knowledge tools; agent selects tools within limits.
- No task tools, external actions or page mutations. No release-readiness workflow.
- Ground factual internal claims in retrieved sources. If evidence is absent, state what is missing and ask a focused clarification; general suggestions must be labelled unverified for this project.
- Conflicting pages: show disagreement with citations, caution and recommend verification; do not automatically choose newer text. Conflicting comments: same treatment; never instruct users to disable a security control solely because a comment suggests it.
- Optional documented service owner/contact is evidence. Without it, suggest page creator only as a possible contact, explicitly stating service ownership is unknown. Do not infer an owner from author metadata.
- Current permissions applied at every retrieval/source read, including historical citation clicks. Latest-index eligibility checked again before returning grounded evidence; stale evidence triggers retrieval retry/qualified unavailable result.
- Conversation context is private, organization-scoped and bounded; no cross-session saved preferences in MVP. User may delete own conversations.
- Defaults for later bounded execution: at most 6 tool calls, 2 retrieval rounds, 60 seconds total, cancellation support, configurable model/output/context limits; tune only with evidence. Do not expose hidden chain-of-thought. Show safe tool name, status, duration and source counts instead.
- Read-only MCP search/read tools authenticate the calling service and validate tenant/user scope; never trust model-supplied tenant IDs. MCP is not a permission bypass or a prerequisite for ordinary page UI.
- Evaluation: at least 30 synthetic cases covering supported answers, missing evidence, conflicts, contacts, comments, onboarding, tenant/scope isolation, malicious document instructions, stale versions. Report retrieval recall@k, citation support/validity, appropriate abstention, tool behavior, latency/usage and failures. Set measured quality gates before enabling AI; zero cross-tenant disclosures and zero unauthorized actions are mandatory.

## 10. Security and operational quality

Treat rich text/comments/retrieved content as untrusted data. Sanitize rendering, block script/unsafe link schemes, validate editor schema; use CSP/security headers and avoid arbitrary HTML injection. Later documents cannot override system instructions or authorize tool calls. Parameterize SQL. Authenticate every resource route; authorize within transaction where write races matter.

Use least-privilege service credentials, environment-secret injection and `.env.example` placeholders; ignore secrets/state dumps. No tokens, passwords, raw question/page bodies or sensitive provider outputs in ordinary logs. Audit publication, archive, role/invite changes and comment moderation. Audit storage is admin-readable through an optional API; an audit dashboard is not required. User-visible errors carry request ID.

Tests: unit for policy/state transitions; real PostgreSQL integration for authorization/invariants/races; browser tests for actual user flows; contract tests for mock/disabled AI; CI lint/types/build/tests. Do not count stubbed authentication or mocked DB tests as proof of isolation. Add readiness/health, graceful shutdown, job lease recovery, migration rollback/recovery notes, documented PostgreSQL backup and demonstrated restore in a disposable database.

Capacity: seed 200 realistic synthetic pages across two organizations with mixed code/tables/comments. Test ordinary API navigation/search with 20 memberships and five concurrent authenticated clients; record hardware and measured results. Later separately measure five AI conversations. No invented SLA or guaranteed model latency. Paginate, avoid N+1 queries, use DB indexes/connection pooling, and keep workers separable for future scale. Demo single-node deployment is not highly available.

## 11. AWS design, cost and deployment gate

Implement Terraform and scripts now; do not apply them during foundation. Suggested low-complexity validation topology: one short-lived compute instance running web reverse proxy/API/worker/PostgreSQL containers, limited disk, no public database, HTTPS before any real credentials. No NAT gateway, load balancer, RDS, managed vector store, Kubernetes, reserved commitments or custom domain purchase by default. This topology is for validation, not production availability. Bedrock is attached only in AI phase and uses least-privilege model/region permissions, never static browser keys.

Before apply: verify current official AWS region-specific prices/model availability, taxes/currency assumptions, storage/IPv4/data/mail/log charges, existing spend and credits. Record conservative estimate for a fixed test duration, reserve headroom within INR 500 combined ceiling, obtain the user's explicit deployment instruction and account/region details. If estimate does not fit, do not deploy; offer a reduced validation window/topology. Terraform validation cannot prove spending fits the budget.

Provide create/test/destroy runbooks, maximum lifetime cleanup, billing alarms as warning only, and residual-resource inventory. Stopping a VM does not eliminate disk/address charges. Destruction must be limited to project-owned resources in its isolated state; never sweep unrelated account resources. Preserve local source and optional local DB backup. No hard budget guarantee: alarms and delayed billing do not enforce a real-time cap. Never claim actual AWS validation when only plan/validate ran.

## 12. Acceptance and definition of done

Foundation is done only when a clean checkout can run documented setup, migrations, demo seed, app and verification without a model/cloud account. Two synthetic users in separate organizations cannot access each other's data by UI, forged API IDs, search, comments, history or chat. All four roles pass positive/negative capability tests. Sign-up/email/invites/reset work via Mailpit. Editor creates a nested page with code/table, drafts, publishes twice, and a Reader sees only published content/history. Stale concurrent edits fail safely. Comments follow permissions/revisions. Archive removes content from normal access/search/new retrieval. Chat disabled/mock is labelled honestly. Jobs survive retry/restart and stale completion. CI produces reproducible verification evidence. Terraform fmt/validate and local container smoke checks pass; cloud apply remains deferred.

Record exactly what was tested, commands, environment, timestamp, exit code, evidence paths and remaining limitations. Passing automated checks is not a guarantee of correctness; no manual approval is required for routine local milestone progress, but never fake browser checks, skip required failures, weaken assertions or mark blocked features done.

The final handoff includes source, both documents with checked tasks, root AGENTS.md, progress/checkpoint ledger, OpenAPI, migration/seed scripts, `.env.example`, CI, Docker/Terraform, setup/resume/backup/deployment/teardown instructions, evidence summary and known limitations. The AI stage remains clearly pending.
