## Automatic milestone commits and pushes

After completing each foundation milestone:

1. Run all checks required by that milestone.
2. If any check fails, fix it before continuing.
3. Update MILESTONES.md, PROGRESS.md, and verification evidence.
4. Review the diff for secrets, generated artifacts, and unrelated changes.
5. Stage only files belonging to this project milestone.
6. Commit with:
   feat(Mxx): <short description of completed milestone>
7. Push to the configured working branch.
8. Confirm the remote branch contains the commit.
9. Record the pushed commit in PROGRESS.md and continue automatically.
   Include that checkpoint update in the next milestone commit.

Do not request routine confirmation to commit or push.
Never force-push, bypass branch protection, or commit secrets.
Never push failed or unverified work as a completed milestone.

If push fails because of a transient network error, retry up to
three times. If authentication or permissions are missing, preserve
the local commit, record and report the blocker, and stop. Retry pending pushes before starting later milestones.

Do not mark a milestone fully delivered until its verified commit
has been pushed successfully.

## Autonomous Milestone Execution

- Work on the develop branch.
- Read the milestone tracking document before starting.
- Select the next incomplete milestone.
- Implement all its subtasks.
- Run linting, type checks, tests, and build verification.
- If verification fails, fix the issues and rerun checks.
- Never mark a milestone complete unless all required checks pass.
- After successful verification:
  1. Mark the milestone and subtasks complete.
  2. Record the verification results.
  3. Stage only milestone-related changes.
  4. Commit using a descriptive conventional commit message.
  5. Push to origin/develop.
  6. Confirm the push succeeded.
- If pushing fails, preserve the commit and report the blocker.
- Never force-push.
- Never commit secrets or credentials.

## Resume Behavior

When instructed to "resume":

1. Inspect git status and recent commits.
2. Read the milestone tracking document.
3. Check what was completed and verified.
4. Resume unfinished work.
5. Avoid repeating verified completed tasks.
6. Continue through the remaining milestones.

# Codex project operating instructions

Read IMPLEMENTATION_SPEC.md, MILESTONES.md and PROGRESS.md before any implementation. The current task ledger and repository files are authoritative, not chat memory.

When the user says `resume`, `continue`, or equivalent:
1. Read these files and the latest docs/evidence entries. Inspect git status/diff/log and active local processes without discarding any changes.
2. Reconcile the last checkpoint with actual files, migrations and verification. A checkbox alone is not proof. Do not rerun destructive seed/reset commands against an unknown database.
3. Inspect the last in-progress subtask. Reproduce its last failing or focused check; if incomplete, continue it. Reopen claimed completed work when relevant checks fail or evidence does not match its files.
4. Select the first unchecked subtask in the earliest incomplete foundation milestone whose dependencies are complete; stop and report unresolved blockers rather than skipping them. Implement, verify, record evidence, update the ledger and checkpoint, and continue automatically.
5. Stop only at the completed foundation gate, a genuine blocker requiring unavailable credentials/environment/user decision, or a boundary forbidding the next action. Record and report the blocker precisely and stop if it cannot be resolved safely; do not skip a blocked milestone.

Authorized scope: local implementation, dependency installation, migrations in the dedicated development/test DB, synthetic seed data, tests, builds, local containers, repository-local documentation, and scoped commits. Preserve pre-existing/user changes. Never use git reset --hard, force-push, delete unrelated files, or reset an unknown database. Push verified milestone commits only to the configured origin/develop; do not create other remote repositories or send real messages. Mailpit is the local mail sink.

Cloud provisioning/destruction, paid model calls and deferred AI milestones are outside the foundation execution scope. Terraform format/validate and offline policy tests are allowed; do not apply. Do not silently bypass platform approvals. Missing tooling is not permission to weaken required verification.

After every verified subtask and before ending: update MILESTONES.md checkboxes, PROGRESS.md, and docs/evidence. Record exact task ID, outcome, relevant files, commands, exit codes, environment, limitations and next action. Redact secrets and sensitive content. Checkpoint in-progress work honestly. Commit completed coherent work when local Git permits; record when commits are unavailable. Never claim a commit or test that did not happen.

Use project verification scripts. Fix relevant failures before marking done. No empty tests, success-on-failure wrappers, skipped required suites, invented screenshots, fake AI claims, or marking cloud work complete after validate alone. Mock AI remains clearly labelled. Use maintained compatible dependencies and lockfiles. Keep org isolation enforced server-side on every resource and future tool.

Use deterministic defaults from the specification for routine choices. Record architecture decisions in docs/DECISIONS.md. Ask only for material unresolved product/cost/security decisions or required credentials. Continue milestones without repeated approval.

## Authoritative execution and delivery rules

The root IMPLEMENTATION_SPEC.md and MILESTONES.md remain canonical; PROGRESS.md is the durable checkpoint. Do not relocate or duplicate them. Documentation setup is separate from M00 implementation; complete and push setup before implementing M00. The current setup request ends after that documentation push. A subsequent resume executes the foundation sequence automatically.

MILESTONES.md uses exactly NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETE for milestone states. Select the earliest incomplete foundation milestone M00–M10; never skip dependencies or blocked work. Mark IN_PROGRESS before implementation. Check subtasks only after their acceptance and verification evidence pass. COMPLETE means every subtask and acceptance gate passed; delivery additionally requires a successful push and exact remote SHA verification. Deferred M11–M14 remain NOT_STARTED until explicitly authorized.

For each milestone, run its listed commands and all relevant tests, lint, type checks and builds. Missing scripts/services/tools are failures or blockers, never passes. Fix failures and rerun affected checks. Record exact commands, exit codes, timestamps, environment, tested files/commit and limitations in docs/evidence/Mxx.md. Update MILESTONES.md and PROGRESS.md with code in the same milestone commit. Do not mark M00 complete merely because automation documentation exists.

Before committing, review git diff and the staged diff for secrets, generated artifacts and unrelated changes. Preserve pre-existing work; stage explicit milestone files only. Use feat(Mxx): <description>. Work on develop and push to origin/develop without routine confirmation. Capture local HEAD, push, and compare git ls-remote origin refs/heads/develop with that SHA AND current HEAD. A successful push message alone is insufficient. If the remote advances, reconcile safely without force-pushing and reverify; stop on conflicts requiring unsafe overwrite. Retry transient network failures up to three times. Preserve local commits and record/report authentication, permission or other unresolved blockers; stop before subsequent milestones.

After remote verification, record the pushed SHA in PROGRESS.md and continue the next milestone automatically. Include this checkpoint in the next milestone commit; at the final gate use a documentation checkpoint commit, push and verify it too. A checkpoint must not embed its own future SHA: record the preceding verified commit and verify the checkpoint commit externally. On resume, reconcile pending local commits and remote delivery before new implementation; do not duplicate already verified work. Never bypass failing checks, branch protection or platform permissions; never fabricate evidence.
