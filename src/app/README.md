# `src/app`

Next.js App Router root for BattleFlow.

## Contents

- `layout.tsx` defines global HTML structure and injects Supabase browser config.
- `page.tsx` redirects the root route to `/dashboard`.
- `robots.ts` defines crawler behavior.
- `globals.css` holds Tailwind CSS 4 variables and global styling.
- `dashboard/` contains the authenticated product workspace shell and pages.
- `login/` contains the sign-in screen.
- `api/` contains route handlers.

## Rules

- Use App Router conventions only; there is no Pages Router.
- Do not add raw `<head>` tags. Use metadata APIs.
- Keep browser-only behavior inside Client Components.
- Set route-handler `runtime = 'nodejs'` when using Node APIs, file-system access, or child processes.
- Preserve hydration safety for locale/time/browser-derived values.

