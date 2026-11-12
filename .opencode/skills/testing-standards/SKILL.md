---
name: testing-standards
description: Test everything in blocks, not per component, to save context and tokens. Use when writing or running tests.
---
## Layout
- All tests live in test/ at the project root. Write only inside test/. If a test reveals a bug in application code, report it instead of silently changing app code or weakening the test.

## Current information
- Never rely on memory for test tools, versions or syntax. Search with the Brave Search MCP first and prefer official docs.
- At the start, list the available MCP tools and use the best fit (for example a browser tool for end-to-end checks).

## Block testing
- Mirror the project by block: test/<block>/ (for example test/auth, test/billing), plus test/e2e for full user flows. Shared fixtures and helpers go in test/shared. Never copy setup code between blocks.
- A block is one feature or module, not one component or function. Write one suite per block covering its normal path, edge cases and bad input. Every block must be covered.
- Run one block at a time with a single command. Do not run or report test by test.
- Keep output small. Never paste full logs. Report only failing assertions with the block name and the error line.
- Do not re-run passing blocks unless related code changed.
- Finish with one end-to-end pass across the main flows.

## Report format
Start with PASS or FAIL, then one line per block (name: pass or fail). For each failure give: what broke, steps to reproduce, and the error line only.
