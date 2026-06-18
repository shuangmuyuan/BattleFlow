# AI Agent Collaboration

## Ownership

- Keep changes scoped to the user request.
- Do not revert user changes unless explicitly asked.
- When touching a file with existing uncommitted changes, read the diff first and work with it.
- Prefer small, coherent patches.

## Handoffs

A useful handoff includes:

1. current goal;
2. files changed;
3. validation run and result;
4. remaining tasks;
5. known risks;
6. exact blocker, if any.

Use `.dwp/` for structured DWP state and `tmp/` for throwaway scratch. Do not place scratch artifacts in source folders or `docs/`.

## Conflict Avoidance

- Check `git status --short` before edits and before final reporting.
- Keep docs, `.agents/docs/`, and command files in sync when changing the agent kit.
- Keep `skills-lock.json` in sync with installed `.agents/skills`.
- Avoid broad refactors during documentation or harness work.

## Review Expectations

Before marking a task done:

- validation gates pass, or skipped checks are named with reasons;
- security impact is stated;
- runtime data and secrets remain untracked;
- generated docs are repo-specific and do not contain placeholders.

