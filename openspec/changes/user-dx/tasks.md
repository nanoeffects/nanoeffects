# Tasks

## 1. Spike the docs check

- [x] 1.1 Check that the TypeScript compiler API works with the repo's toolchain (see the open question in design.md); pick the in-memory host or the temp-dir fallback and note the choice in design.md.
- [x] 1.2 Write a throwaway extractor that lists fences by page and line, and count how many blocks fail and which free names they use. Record the numbers in design.md (Risks).

## 2. Docs check script

- [x] 2.1 Add `scripts/docs-check.mjs`: scan `docs/*.md` for `js`, `javascript`, `ts`, `typescript` fences, honor `<!-- docs-check: skip -->`, ignore other languages.
- [x] 2.2 Check each block as its own module with the project `tsconfig` options and paths, `noImplicitAny` off for `js` blocks; print `page:line: message` for each error and a summary of checked and skipped blocks; exit non-zero on any error.
- [x] 2.3 Add `scripts/docs-stubs.d.ts` with the external names the spike found, as `any`.
- [x] 2.4 Tests (vitest, a small fixture of Markdown strings): correct block passes; removed export fails with page and line; two blocks do not share names; declared stub passes; undeclared name fails; skip marker skips and counts; `bash` fence ignored; nothing is written to the working tree.
- [x] 2.5 Run it on the real docs. Fix the snippets that are wrong; skip with a reason the ones that cannot be fixed cheaply.

## 3. Wire the gates

- [x] 3.1 Add `"docs:check": "node scripts/docs-check.mjs"` to `package.json` and put it in `verify`; add the step to the CI `verify` job.
- [x] 3.2 Update the Commands section of AGENTS.md (`docs:check`, and the `biome` paths that `package.json` already has) and the Documentation section (skip marker, stubs file).

## 4. Playground

- [x] 4.1 Create `examples/playground/` (`package.json` with `nanoeffects` from npm and `vite`, `index.html`, `main.ts`): an input, a request log, the last result; fake `api.search` with a delay that honors `signal`.
- [x] 4.2 Use the wiring of `examples/search.ts` unchanged, with a comment on each nanoeffects call (`createBus`, `debounce`, `latest`).
- [x] 4.3 Keep it inside the gates: `pnpm tsgo` and `pnpm check` pass, `pnpm pack --dry-run` lists no playground file, the root `tsconfig` and `biome.json` need an exclude only if they complain.
- [x] 4.4 Add a test that the wiring block of the playground equals the one in `examples/search.ts`, and a test of the fake `api.search` abort behavior with fake timers.
- [x] 4.5 Run the playground locally (`vite`) in the browser pane: fast typing sends one request; a newer query marks the older one aborted.

## 5. README, changelog, final check

- [x] 5.1 Add one line to the README after "Install": the StackBlitz link and one sentence. Check it against the README rules in AGENTS.md (levels A and B, no second demo).
- [x] 5.2 Add `CHANGELOG.md` entries under Unreleased (docs check; playground).
- [ ] 5.3 Open the StackBlitz URL after the branch is pushed (the link works only for pushed code) and confirm it installs and runs.
- [x] 5.4 Run `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run && pnpm build`, then `pnpm verify`; it must pass.
