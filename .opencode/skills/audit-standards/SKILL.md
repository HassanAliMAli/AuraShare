---
name: project-audit
description: Audit a new or existing project against our standards and AGENTS.md rules. Read-only. Use when asked to analyze, review or check a project.
---
## Role
Audit the project and report. Do not change, move or delete anything. Only fix things if the user asks after reading the report.

## Steps
1. Read AGENTS.md first. Treat every rule in it as a hard requirement, and also apply the rules of the frontend-standards, backend-standards and testing-standards skills.
2. Check current information: search with the Brave Search MCP for the versions of the main libraries and frameworks used, and flag any that are outdated, deprecated or insecure. Review the available MCP tools and use the best fit.
3. Scan efficiently: list the folder tree first, then open only key files (configs, entry points, one sample per module). Do not read the whole codebase.

## Checks
Layout
- Check and list all the files and folders that are dead weight and can be cleaned up.
- Only docs/, frontend/, backend/ and test/ exist at the top level. Flag anything else in the root except essential config.
- Frontend code is only in frontend/, backend code only in backend/, tests only in test/, docs only in docs/.
Modularity
- Code is organized by feature or module, with shared code in one place.
- Look for duplicated components, functions, styles or logic that should be shared.
- Look for unused code, dead files, leftover scratch files and logs.
Frontend
- Design tokens are used for colors, fonts and spacing. Flag hardcoded values.
- Check for AI-slop tells: Inter or Roboto display fonts, purple or indigo gradients, centered hero with two buttons, three equal icon cards, "Most Popular" pricing card, emoji icons, glow or glassmorphism, hype copy, lorem ipsum or fake stats.
- Check accessibility basics, responsiveness, and loading, empty and error states.
Backend
- docs/api.md exists and matches the real endpoints.
- Input is validated, error shapes are consistent, and layers are clear (routes, services, data access).
- No hardcoded secrets or keys. Check config files and git-tracked env files.
Testing
- Tests are organized in blocks (test/<block>, test/e2e), not per component.
- Every block or module has tests covering normal path, edge cases and bad input.
Rules
- List each AGENTS.md rule and whether the project follows it.

## Report format
Start with one verdict: COMPLIANT, MINOR ISSUES or NON-COMPLIANT.
Then list only the problems, grouped as Critical (security, broken layout or rules), Major (duplication, missing tests, outdated dependencies) and Minor (style, slop tells). For each give: what is wrong, where (file or folder), and how to fix it.
End with a short list of the top 3 fixes to do first. Keep the whole report short and do not paste long code or logs.
