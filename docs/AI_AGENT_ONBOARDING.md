# AI Agent Onboarding

## First Session Checklist

1. Read [../AGENTS.md](../AGENTS.md).
2. Read [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), [STANDARDS.md](STANDARDS.md), and [SECURITY.md](SECURITY.md).
3. Read the module README nearest the files you expect to edit.
4. Run `git status --short` and preserve unrelated user changes.
5. Use `rg` for search and inspect existing patterns before editing.
6. Use pnpm only.
7. Run `pnpm validate` before finishing source changes.

## Common Workflows

- UI change: read `docs/DESIGN.md`, root `DESIGN.md`, `src/components/README.md`, and the target dashboard module. Validate with `pnpm validate`; run the app for visual checks when layout changed.
- API change: read `src/app/api/README.md`, `src/lib/README.md`, and `docs/SECURITY.md`. Validate input narrowing and error status behavior.
- Skill registry change: read `src/lib/README.md` and `skills/official/README.md`. Preserve import and review semantics.
- Workflow change: read `src/app/dashboard/README.md`, `src/lib/README.md`, and `docs/PERFORMANCE.md`.
- Agent kit change: read `.agents/README.md` and update `.agents/docs/` catalogs.

## DWP Usage

Use Deep Work Plans for multi-step changes:

```text
/dwp-create <goal>
/dwp-execute
/dwp-status
/dwp-resume
/dwp-refine
/dwp-verify
```

Plans and drafts belong in `.dwp/`, which is gitignored.
