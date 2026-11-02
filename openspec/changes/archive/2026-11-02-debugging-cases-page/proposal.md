# Proposal

## Why

The page `docs/debugging-compared.md` compared nanoeffects with RxJS, Effector and mitt. That comparison is for internal use. The public docs need only the cases of this library, so the page loses the comparison and its name.

## What Changes

- The page is renamed to `docs/debugging-cases.md` (and the Russian page) and keeps its three cases, "who listens", "which task began a chain" and "why a request stopped", and the list of what is missing. The table that compares other libraries, and every mention of them, go.
- The sidebar, the Russian title and `llms.txt` follow the new name.
- The capability `docs-debugging-comparison` is retired and `docs-debugging-cases` takes its place.

## Capabilities

### New Capabilities
- `docs-debugging-cases`: the page of debugging cases and the places that list it.

### Modified Capabilities
- `docs-debugging-comparison`: retired.

## Impact

- `docs/debugging-cases.md`, `docs/ru/debugging-cases.md`, `tools/docs-site/.vitepress/sidebar.ts`, `llms.txt`. No code changes.
