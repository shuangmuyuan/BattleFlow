# `src/components`

React component root.

## Areas

- `ui/` contains shadcn/ui components and bounded Radix wrappers.
- `battleflow/` contains product-specific helpers used across dashboard pages.

## Standards

- Use `src/components/ui` before adding new primitives.
- Use `lucide-react` for icons.
- Keep product-specific composition in `battleflow/` or the page module, not inside generic `ui/` primitives.
- Business code must not import raw Radix overlay packages directly. ESLint enforces this outside the wrapper files.
- Keep long text from breaking button, card, and panel layouts.

## Key Product Components

- `battleflow/ui.tsx`: `PageHeader`, `StatusBadge`, `ProductEmptyState`, `SectionTitle`, and shared surface/card class strings.
- `battleflow/compact-markdown.tsx`: lightweight Markdown preview and rendering for Skill/workflow output surfaces.

## Validation

Run `pnpm validate`. For overlay wrapper changes, inspect `scripts/check-overlay-bounds.mjs` and ensure required tokens remain present.

