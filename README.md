# Team Knowledge Assistant

Multi-organization knowledge authoring and published history, with model-neutral AI contracts. The foundation is under construction; MILESTONES.md is the authoritative completion ledger. No real AI or cloud resources are enabled.

## Local bootstrap

Use Node 22.22.1 (`nvm use` if installed), npm 9+, Docker with Compose for M01 onward. The checked-in `.npmrc` keeps the cache inside the ignored `.cache/` directory.

```sh
npm ci
cp .env.example .env
npm run status
npm run checkpoint:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run dev
```

Web: http://localhost:5173, API reserved: http://localhost:3001, PostgreSQL reserved: 127.0.0.1:5432, SMTP: 127.0.0.1:1025, Mailpit inbox: http://localhost:8025. M00 serves the bootstrap web page only; HTTP API and local services arrive in M01. Stop development with Ctrl-C. Never point tests or seeds at a shared/production database. `.env.example` contains only synthetic local defaults; `.env` is ignored.

Integration/contracts/browser/database/Compose/infrastructure scripts intentionally exit nonzero until their respective milestones implement the real checks. `verify:foundation` fails until all required suites exist and pass. No success-on-missing-tools behavior.

## Resume and evidence

Read AGENTS.md, IMPLEMENTATION_SPEC.md, MILESTONES.md, PROGRESS.md and docs/evidence. Run `git status`, inspect local/remote commits, then `npm run status`. Reconcile actual artifacts and evidence before continuing the earliest incomplete milestone. The status command is read-only and never executes commands from ledger text. See docs/DECISIONS.md for architecture decisions.

Milestone delivery uses develop → origin/develop with exact SHA comparison, no force-push. A future active Codex session can continue from `resume`; there is no unattended background runner. Cloud apply and paid AI require separate explicit authorization.
