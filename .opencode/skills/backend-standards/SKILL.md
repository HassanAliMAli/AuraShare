---
name: backend-standards
description: Modular, reusable, clean backend rules. Use for any API, database or server work.
---
## Layout
- All server code, configs and migrations live in backend/. Docs go in docs/. Never put code, notes, logs or scratch files in the project root.
- Exception (approved 2026-11-12): `wrangler.toml` stays at the repository root. It is the project deployment descriptor — it binds the Worker entry (`backend/index.ts`) and the SPA assets the frontend build emits to `dist/`. The Cloudflare Workers Builds integration runs `npx wrangler deploy` from the repository root, and wrangler only searches the working directory and its ancestors, so a config inside `backend/` breaks the deploy pipeline. All server *code* still lives in `backend/`. Do not move it.

## Current information
- Never rely on memory for libraries, APIs, versions or syntax. Search with the Brave Search MCP first, prefer official docs, and check the date and version.
- At the start of a task, list the available MCP tools and use the best fit for each operation (for example a database tool for data). If a useful tool is missing, say so.

## Standards
- Organize by module (one folder per domain such as auth or billing), with shared code in one place (config, errors, validation, db helpers).
- Before writing anything, search backend/ for existing code that does the job. Reuse or extend it. Never duplicate logic. Anything used twice becomes a shared module.
- Keep functions small and single-purpose. Layer clearly: routes, then services, then data access.
- Write the API contract to docs/api.md first (endpoints, inputs, outputs, errors) and keep it updated.
- Validate all input. Return consistent error shapes. Secrets come from environment variables, never from code.
- Handle failure paths on purpose: bad input, missing data, timeouts, duplicate requests.
- Run your code before calling it done. No unused code or files.
