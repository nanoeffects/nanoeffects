# Tasks: emit-with-signal

## 1. Plugin
- [x] 1.1 `src/signal/plugin.ts` and `src/signal/index.ts` (only re-exports): `signalPlugin()` wraps `bus.emit`, holds the signal for the time of a call, links the contexts made in that time through the chained `bus.addContext`, one subscription per emit with `onAbort`, removed when the promise of the command settles or the signal aborts. Add the entry `nanoeffects/signal` (package `exports`, `tsdown` config, `exports.test.ts`) and a `size-limit` entry from the measured size. Verify: `pnpm build && pnpm size`
- [x] 1.2 Tests in `src/signal/plugin.test.ts` for every scenario of `emit-signal`: abort reaches the handler and its reason, the result is returned, an aborted signal, `latest` and `retry` see the abort, listeners of the type, a nested emit is not linked, no signal means no listener added, a thousand emits on one signal leave no subscription, a scope and a signal in one object with both plugins in either order. Verify: `pnpm vitest run src/signal`
- [x] 1.3 Types: the bus after `use(signalPlugin())` takes `{ signal }` for the call forms and rejects it for the string form; cases in `src/tests/types.test.ts`. Verify: `pnpm tsgo`
- [x] 1.4 Plugin matrix: an installer and a probe for `signalPlugin` in `src/tests/plugin-matrix.test.ts`, including the pair with `scopePlugin`. Verify: `pnpm vitest run src/tests/plugin-matrix`

## 2. Documentation
- [x] 2.1 Check how SWR and React Query pass a signal today (their docs), and declare `useQuery`, `useSWR`, `@tanstack/react-query` and `swr` in `scripts/docs-stubs.d.ts`. Verify: `pnpm docs:check`
- [x] 2.2 The page `docs/query-libraries.md` ("Use nanoeffects with React Query and SWR"): problem, who owns what, the React Query recipe, the SWR recipe, why `await emit` has no `isLoading`, what `createJob` outcomes are for. Files as the docs rules say (bus, events, handlers, component), one step per line, a comment on each nanoeffects call. Link it from `docs/react.md`, `docs/plugins.md` (the plugin), `docs/package.md` (the entry) and `llms.txt`. Verify: `pnpm docs:check && pnpm llms:check`
- [x] 2.3 JSDoc of `signalPlugin` with an `@example`, and `CHANGELOG.md` `Unreleased`. Verify: read the entry

## 3. Verify
- [x] 3.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`. Verify: all green, `createBus` within its 1.3 kB limit (1296 bytes)

## Workflow follow-up
- Archive with `/opsx:archive`. `job.status()` and policies that report a real start stay separate changes.
