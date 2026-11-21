<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## NEXUS UI/UX project direction

- Build all NEXUS frontend pages and shared UI with Tailwind CSS and shadcn/ui conventions and components.
- Keep page composition in route files and reusable UI in components; keep visual styles/tokens in `src/styles/...` where practical.
- Preserve the established responsive, accessible light/dark theme and NEXUS palette across all roles and pages.
