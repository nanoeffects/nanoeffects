# Tasks

## 1. Read the location

- [x] 1.1 Add `src/trace/source.ts` with `sourceOf`: capture `new Error().stack` once, parse V8, Safari and Firefox frames, skip the plugin's own frames by number and, when `import.meta.url` of the module contains `/node_modules/nanoeffects/`, the frames under that package root, return `file:line:column` or `void 0`, never throw.
- [x] 1.2 Tests in `src/trace/source.test.ts` on fixed stack strings of the three engines, a stack that is not a string, an empty stack, a frame with a `file://` url, a Windows path and a frame with no location, an app folder named `nanoeffects/dist` that must not be skipped, the package root with pnpm's layout, and a module URL outside `node_modules` (only the count applies).

## 2. Carry it through the trace

- [x] 2.1 `src/core/types.ts`, `src/core/tracer.ts`, `src/core/context.ts`: optional `source` on `TraceEvent` and `TaskInfo`, `rename?(ref, type, source?)`, forward it in `renameTask`. Measure `createBus` before and after; stop and report if it grows.
- [x] 2.2 `src/trace/tracer.ts`: keep `source` on the ref, copy it to events and to `TaskInfo`, including the second `task` call at a rename.
- [x] 2.3 `src/trace/plugin.ts`, `listeners.ts`: the `source` option, `Entry.source`, wrap an anonymous listener when the option is on (a string event key only), pass the source to `renameTask`.
- [x] 2.4 Tests in `src/trace/plugin.test.ts` and `tracer.test.ts`: named, anonymous, `once`, off by default (no `Error` made), predicate listener unchanged, no tracer, no stack, a logger with `task`, an old two-argument `rename`.
- [x] 2.5 A probe in `src/tests/plugin-matrix.test.ts`: the source is on the event in every order of plugins.

## 3. Show it

- [x] 3.1 `consoleLogger({ source })` and `describeBus(bus, { source })`, with tests; update `src/tests/exports.test.ts` and `types.test.ts` if the types change.
- [x] 3.2 `pnpm build`, `pnpm size`: raise the `trace` limit only as far as measured; `createBus` unchanged; `pnpm smoke` on both builds.

## 4. Docs

- [x] 4.1 `docs/tracing.md` and `docs/ru/tracing.md`: a section "Find the line of a listener" with `tracePlugin({ source: true })`, the output, the source maps note and the limit about bundles; update the page's list of sections.
- [x] 4.2 `docs/debugging-compared.md` and the Russian page: a line in the table and in "Know what is missing" (the gap is closed, the click-through UI is not).
- [x] 4.3 `CHANGELOG.md` under `Unreleased` (`### Added`).
- [x] 4.4 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm docs:site && pnpm vitest run && pnpm build`, then `pnpm verify`.
