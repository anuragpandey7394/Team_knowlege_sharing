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
the local commit, record the blocker, and continue independent local
work. Retry pending pushes before pushing later milestones.

Do not mark a milestone fully delivered until its verified commit
has been pushed successfully.