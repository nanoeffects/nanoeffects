# Design

## Context

Only `examples/*.ts`, `src` and `integration` are in the `tsconfig` `include`, with `nanoeffects/*` mapped to `src`. The `docs/*.md` pages hold about 90 fences (guide 26, effects 20, tracing 14, and so on); many use names from the reader's app (`api`, `report`) and are written in plain JS on purpose (AGENTS.md: JS first). `pnpm-workspace.yaml` has only `allowBuilds`, so a nested `package.json` is not a workspace member. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Catch a docs snippet that no longer compiles against `src`, in `pnpm verify` and CI.
- A playground a reader opens in one click, kept in step with `examples/search.ts`.

**Non-Goals:**
- Executing snippets, or checking their printed output.
- Making every snippet self-contained: external names stay external, declared once.

## Decisions

**1. (Changed in task 1.1.) Run the `tsc` CLI on generated files in a cache folder, not the compiler API.**
The repo uses TypeScript 7 (native): its package has no `createProgram`, only an unstable API. The script writes each block to `node_modules/.cache/docs-check-*/block-N.ts` (inside the project, so imports of installed packages resolve), adds a `tsconfig.json` that extends the root one (its `paths` still point at `src`), runs `tsc -p`, maps `block-N.ts(line)` back to `page:line`, and removes the folder in a `finally`. The text below describes the first idea and is kept for the record.

**1 (first idea). Check with the TypeScript compiler API in a node script, not `tsc` on a generated tree.**
The script reads `tsconfig.json`, creates a `ts.Program` over virtual files (a custom `CompilerHost` that serves the extracted blocks from memory next to the real files) and reads diagnostics per file. Alternative: write blocks to a temp dir and run `tsc -p`. Rejected: paths in `tsconfig` and the `include` list make a temp tree fragile, and mapping errors back to `page:line` is easier with virtual file names such as `docs/policies.md#L9.ts`. Nothing is written to disk, so the "no files left behind" requirement holds by construction. `typescript` is already a dev dependency (`tsc` in `pnpm tsgo`); the script uses it through `import ts from "typescript"` — to be confirmed in task 1 against tsc 7 / `tsgo` (see Open Questions).

**2. One module per block; `js` blocks report only stale names.**
The spike (task 1.2) found 94 errors in 47 blocks; 61 were "cannot find name" and most of the rest were payload typing that a JavaScript reader never sees (`createBus()` has an open event map, so `(value) => value * 2` has an `unknown` payload). For `js` blocks the script keeps only the errors that show a stale snippet: syntax errors and TS2300, 2304, 2305, 2307, 2353, 2451, 2552, 2554, 2561, 2724 (missing name, export or module, redeclared name, unknown option, wrong argument count). `ts` blocks report everything. `noImplicitAny` is off for all blocks.

First idea, kept for the record:
Each block is its own file (`export {}` appended so it is a module and `const bus` does not clash between blocks). `js` blocks are checked as `.ts` with `noImplicitAny: false`, because JS docs have untyped handler parameters; `ts` blocks keep the project's strict options. Contextual typing still catches wrong imports, wrong option names, and wrong arity, which is the stated goal. Alternative: `allowJs`/`checkJs` on `.js` virtual files: same result with more flags; rejected.

**3. Stubs in a `.d.ts`, declared as `any` values.**
`scripts/docs-stubs.d.ts` holds `declare const api: any; declare const report: any;` and similar, and is added to the virtual program as a global script file. A name is added only when a real snippet needs it. Alternative: auto-ignore error `TS2304` ("cannot find name"): rejected, it would hide a typo in a library name (`creatBus`) and the "undeclared name fails" requirement.

**4. The skip marker is an HTML comment.**
`<!-- docs-check: skip -->` on the line right before the fence is invisible in rendered Markdown and on GitHub, and needs no change to fence syntax (an info string such as `js skip` breaks syntax highlighting on some renderers). The parser is a small line scanner for fences; no Markdown dependency.

**5. Playground is a Vite vanilla-TS project under `examples/playground/` that depends on the published package.**
StackBlitz opens a GitHub subfolder (`https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground`) and runs `npm install && npm run dev`. Its `package.json` lists `nanoeffects` from npm (a version range), so it shows the release. Alternative: a link-to-`src` setup: rejected, StackBlitz cannot build the repository's own toolchain quickly and the reader would see internals instead of the package they will install.
The page has one input, a log of requests (`started`, `aborted`, `done`) and the last result. The log is the point: abort is invisible in a plain result list.

**6. Keep the playground out of the root gates' blind spots.**
The root `tsconfig` includes `examples`, and its `paths` would resolve `nanoeffects` to `src` for the playground too: good for `pnpm tsgo` (it type-checks against the current source), while StackBlitz resolves the npm package. `files` in `package.json` already limits the tarball to `dist`, `README.md`, `LICENSE`, `docs`, so the playground is not published. The playground needs `vite` types and DOM: the root `lib` has DOM; `vite` is not a root dependency, so the playground avoids `import.meta.env` and Vite-only imports.

**7. Docs fixes go with the check.**
Failing snippets are fixed first. A skip needs a one-line reason in the comment (`<!-- docs-check: skip - needs a React app -->`), so skips stay reviewable.

## Risks / Trade-offs

Result of the spike: 47 blocks, 94 errors at first. After the stubs file (about 30 names), two `tsconfig` paths that were missing (`nanoeffects/observable`, `nanoeffects/dev`), the `js` filter, three doc fixes (imports and a wrapping handler in `effects.md`, an import in `guide.md`) and two skips (`observable.md`: needs rxjs; `stores.md`: five alternatives in one block), the check passes. The run takes under a second.

- [Many docs blocks fail at first and the change grows] → task 1 is a spike that counts failures before the script is wired in; blocks needing a long fix are skipped with a reason and listed, not fixed in this change.
- [Stubs of type `any` hide a wrong use of `api`] → intended: the check covers the library calls, not the reader's code.
- [The playground drifts from `examples/search.ts`] → the wiring block is the same text; a task adds a small test in `scripts/` (or a vitest case) that compares the two blocks, so a change in one fails the other.
- [The playground shows the release, so a new API in `main` is not there] → acceptable: it uses only `createBus`, `debounce`, `latest`, all stable.
- [`docs:check` slows `verify`] → one `ts.Program` for all blocks, measured in task 1; expected seconds, not minutes.

## Open Questions

None. (The compiler API question is answered: use the `tsc` CLI, decision 1.)
