# Proposal: online playground and checked documentation snippets

## Why

A new reader cannot try nanoeffects without installing it, and a code block in `docs/` can go stale without anyone noticing: only `examples/*.ts` are type-checked, while the pages copy-pasted by readers are not. Both hurt the first minutes of a user (project levels A and B in AGENTS.md).

## What Changes

- A StackBlitz playground, `examples/playground/`: a small Vite project that runs the search example (`debounce` + `latest`) with a fake `api.search` and shows the result and the aborted requests on a page. README gets one link after "Install".
- `scripts/docs-check.mjs`: takes every `js`, `ts`, `javascript` and `typescript` fence of `docs/*.md`, writes each as its own module, and type-checks them with the project `tsconfig` (so `nanoeffects/*` resolves to `src`).
- Free names of a snippet (`api`, `report`, `store`, ...) are declared once in `scripts/docs-stubs.d.ts`. A fence preceded by `<!-- docs-check: skip -->` is not checked.
- `pnpm docs:check` runs the script. It joins `pnpm verify` and the CI job.
- Snippets that fail today are fixed in `docs/` (the docs were wrong) or marked skip with a reason.

## Capabilities

### New Capabilities
- `docs-snippet-check`: type-check the code blocks of the user documentation against the source, with declared stubs and an explicit skip marker.
- `playground`: a runnable online example of the library that a reader opens from the README with no install.

### Modified Capabilities

None.

## Non-goals

- A change to anything in `src/`. The bus, its size and its API stay as they are.
- Running the snippets or checking their output; only types are checked.
- Checking `README.md` blocks, `bash` and `json` fences, or the TypeScript docs of dependencies. README is covered by `pnpm consumer-check`.
- A documentation site, a REPL of our own, or a CodeSandbox / Playwright test of the playground.
- Terms of `llms.txt`, error-message wording and type-error readability (separate changes).

## Impact

- New: `examples/playground/*`, `scripts/docs-check.mjs`, `scripts/docs-stubs.d.ts`.
- Edited: `package.json` (`docs:check`, `verify`), `.github/workflows/ci.yml`, `README.md` (one link), `docs/*.md` (fixed or marked snippets), `tsconfig.json` / `biome.json` only if the playground needs an exclude, `CHANGELOG.md` (Unreleased).
- The playground depends on the published `nanoeffects`, so it shows the release, not `main`.
