# BattleFlow Design System

This file is the agent-facing design-system source for BattleFlow's visual UI. It reconciles the original root `DESIGN.md` direction with the implemented Tailwind v4 tokens in `src/app/globals.css`, shadcn/ui component variants in `src/components/ui`, and product-level helpers in `src/components/battleflow`.

## Overview

BattleFlow should feel like a focused product-planning command desk: dark by default, dense enough for repeated operational work, calm enough for long planning sessions, and precise about workflow state. The visual metaphor from the original design note is a clean tactical table under warm task light, with organized folders, tool cards, and clear status markers. The implemented system supports both light and dark themes, but dark mode is the default and primary design target.

## Colors

Source of truth: `src/app/globals.css` CSS variables exposed through Tailwind v4 `@theme inline`.

| Token | Light value | Dark value | Role and usage |
| --- | --- | --- | --- |
| `background` | `#F8F9FB` | `#0F1117` | Page background. Dark value is the primary product atmosphere. |
| `foreground` | `#1A1D27` | `#E8E9ED` | Primary body text. |
| `card` | `#FFFFFF` | `#1A1D27` | Main panels, cards, popover surfaces, and content containers. |
| `card-foreground` | `#1A1D27` | `#E8E9ED` | Text on card surfaces. |
| `secondary` / `muted` | `#F0F1F5` | `#2A2D37` | Subtle controls, secondary surfaces, inactive fills, and separators. |
| `muted-foreground` | `#6B7280` | `#8B8FA3` | Secondary text and helper labels. |
| `border` / `input` | `#E5E7EB` | `#2A2D37` | Hairlines, input borders, card boundaries, and separators. |
| `brand` / `primary` | `#6C5CE7` | `#6C5CE7` | Main action, active navigation, workflow focus, links, and emphasis. |
| `brand-foreground` / `primary-foreground` | `#FFFFFF` | `#FFFFFF` | Text on brand/primary fills. |
| `success` | `#10B981` | `#00D2A0` | Completed, approved, connected, or healthy states. |
| `warning` | `#F59E0B` | `#FDCB6E` | Pending review, incomplete setup, recoverable attention. |
| `destructive` | `#EF4444` | `#FF6B6B` | Delete, reject, invalid, failed, or irreversible actions. |
| `sidebar` | `#FFFFFF` | `#13151E` | Persistent dashboard navigation shell. |
| `sidebar-accent` | `#F0F1F5` | `#2A2D37` | Sidebar active/hover surface. |

Contrast sanity checks performed while installing this addon:

- `foreground` on `background`: 15.96:1 light, 15.55:1 dark.
- `muted-foreground` on `background`: 4.59:1 light, 5.89:1 dark.
- white text on `brand`: 4.86:1.
- dark `success`, `warning`, and `destructive` on dark background all exceed 4.5:1.

Do not use color as the only carrier of state. Status surfaces also need labels, icons, or structured placement.

## Typography

Source of truth: `src/app/globals.css` Tailwind font variables and component usage.

| Level | Family | Size / weight / line-height | Used for |
| --- | --- | --- | --- |
| Page title | `font-sans` | `text-2xl`, `font-semibold`, `tracking-tight` | `PageHeader` titles and major workspace headings. |
| Section heading | `font-sans` | `text-base`, `font-semibold`, tight tracking | Panels, card headings, form sections, tool surfaces. |
| Body | `font-sans` | `text-sm`, regular, `leading-6` when paragraph-like | Descriptions, dashboard copy, card metadata. |
| Compact UI | `font-sans` | `text-xs` to `text-sm`, medium where interactive | Badges, nav labels, metadata, controls. |
| Code / machine text | `font-mono` | inherited or compact sizes | File paths, command snippets, raw metadata, technical identifiers. |

The implemented `font-sans` stack is system-first for Chinese and English: PingFang SC, Hiragino Sans GB, Microsoft YaHei, system UI, Segoe UI, Roboto, Helvetica Neue, Arial, and sans-serif. The implemented `font-mono` stack is ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, and monospace.

## Layout and Spacing

- Dashboard shell uses fixed viewport height with bounded internal scroll regions.
- Desktop navigation is a left sidebar, `w-60` expanded and `w-16` collapsed.
- Mobile navigation becomes a horizontal scroll strip below the top bar.
- Main content uses compact operational padding: `p-3` mobile, `md:p-6` desktop, with page sections commonly using `gap-4` to `gap-8`.
- Cards and panels must include `min-w-0` where text can truncate.
- Dense dashboard surfaces are preferred over marketing-style hero layouts.
- Stable dimensions matter for boards, counters, toolbars, icon buttons, and repeated tiles.

Use Tailwind spacing utilities already present in the app before introducing new spacing scales.

## Elevation and Depth

BattleFlow expresses depth through surfaces, borders, and restrained shadows:

- `appSurfaceClassName`: `border-border/60 bg-card/95 shadow-sm shadow-foreground/5`.
- `appCardClassName`: same base surface with subtle hover border and shadow changes.
- Overlay components are bounded and scrollable rather than visually oversized.
- Prefer hairline borders and surface contrast to large shadows.
- Avoid decorative gradients, orbs, 3D effects, and atmospheric blur.

## Shapes

Source of truth: `--radius: 0.625rem` in `globals.css`, exposed as Tailwind radius tokens.

- Default control radius: `rounded-md`.
- Cards from shadcn default to `rounded-xl`, but BattleFlow product cards should stay visually restrained and avoid nested card structures.
- Small icon surfaces commonly use `rounded-md` or `rounded-lg`.
- Checkbox uses `rounded-[4px]`.
- Badges use `rounded-full`.

Keep shapes functional. Do not introduce large pill-shaped containers unless the component already uses that pattern, such as badges.

## Components

Source of truth: `src/components/ui` and `src/components/battleflow`.

- **Buttons:** use `Button` variants. Default uses `bg-primary text-primary-foreground hover:bg-primary/90`. Ghost and secondary buttons are preferred for navigation and utility actions. Destructive buttons must use the destructive variant or explicit destructive token pair.
- **Cards and panels:** use `Card` for repeated items, modals, and framed tools. Page sections should not become nested decorative cards. Product cards should use `appCardClassName`.
- **Page headers:** use `PageHeader` for dashboard pages. Keep title, description, optional action, and optional meta compact.
- **Status:** use `StatusBadge` with `neutral`, `brand`, `success`, `warning`, or `danger`. Do not rely on color alone; pair status color with status text.
- **Empty states:** use `ProductEmptyState` with a lucide icon and concise title/description.
- **Forms:** use shadcn inputs, labels, fields, selects, checkboxes, and dialogs. Invalid states use destructive tokens and focus rings.
- **Overlays:** use bounded wrappers in `src/components/ui` only. Business code must not import raw Radix overlay primitives.
- **Markdown previews:** use `CompactMarkdown` for Skill and workflow output previews when full Markdown would overload a panel.

## Responsive Behavior

The app relies on Tailwind default breakpoints and explicit class contracts enforced by `scripts/check-responsive-layout.mjs`.

| Breakpoint | Min width | BattleFlow usage |
| --- | --- | --- |
| `sm` | `640px` | Horizontal form/control layout, compact row transitions. |
| `md` | `768px` | Desktop dashboard shell and sidebar activation. |
| `lg` | `1024px` | Workflow split panes, larger grids, desktop workbench layout. |

Rules:

- Keep text inside buttons, cards, and headers from overlapping or overflowing.
- Preserve horizontal scrolling for mobile nav and wide tables.
- Keep workflow detail views bounded with `min-h-0`, `overflow-hidden`, and internal `ScrollArea`.
- Keep overlays under viewport height with `max-h`, `overflow-y-auto`, and `overscroll-contain`.

## Do's and Don'ts

Do:

- Use semantic tokens such as `bg-brand`, `text-muted-foreground`, `border-border`, `text-success`, and `text-warning`.
- Use lucide-react icons for actions and status cues.
- Keep dashboard UI dense, work-focused, and scannable.
- Keep dark mode as the primary target while preserving light token support.
- Run `pnpm check:overlays` and `pnpm check:responsive` after layout or overlay changes.
- Preserve WCAG AA contrast for normal text; checked token pairs above meet the target.

Don't:

- Do not introduce rainbow gradients, 3D effects, cartoon icons, decorative orbs, or bokeh backgrounds.
- Do not use emoji as functional icons.
- Do not use a blog-like wide whitespace layout for operational screens.
- Do not create new ad-hoc colors outside `globals.css` tokens without a design-system update.
- Do not put cards inside cards for page structure.
- Do not bypass shadcn/ui wrappers or raw-import Radix overlay packages in business code.

## Agent Prompt Guide

For coding agents working in this repo: `docs/DESIGN.md` is the source of truth for BattleFlow visual UI. Before generating or editing dashboard pages, components, layout, or user-facing styling:

1. Use the named tokens in this file and `src/app/globals.css`; do not invent unrelated colors, fonts, radii, or shadows.
2. Choose color by role: `brand` for primary actions and active flow, `success` for completed/approved, `warning` for pending attention, `destructive` for irreversible or failed states.
3. Match the documented component patterns: shadcn/ui primitives, `PageHeader`, `StatusBadge`, `ProductEmptyState`, and restrained card surfaces.
4. Preserve integrity rules: WCAG AA text contrast, status text alongside color, bounded overlays, responsive internal scroll, and no raw Radix overlay imports.
5. When a design value is missing, choose the closest existing token and note the gap instead of adding a new visual language silently.

Suggested instruction for UI tasks:

> Follow `docs/DESIGN.md` strictly. Build the UI using BattleFlow tokens, shadcn/ui components, and documented dashboard patterns; keep contrast, overlay bounds, and responsive scroll contracts intact.

