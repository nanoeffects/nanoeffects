# Tasks

## 1. Code

- [x] 1.1 In `src/signal/fetch.ts` change `signalFetch` to `(ctx: WithSignal, input: RequestInfo | URL, init?: RequestInit) => Promise<Response>`: join `ctx.signal` with `init.signal`, pass the other options unchanged; rewrite the doc comment and its `@example` for the effect form and `effectsPlugin({ fetch: signalFetch })`. Verify: `pnpm tsgo` passes.
- [x] 1.2 Check `src/signal/index.ts` and the key list of the `signal` entry in `src/tests/exports.test.ts`: no key is added or removed. Verify: `pnpm vitest run src/tests/exports.test.ts`.

## 2. Tests

- [x] 2.1 Rewrite `src/signal/fetch.test.ts` for the new form, one test for each scenario of the spec: stops with the task, signal of the caller too, other options pass, no plugins on the bus, `{ signal }` of an outside source, `{}` as `ctx` (run time only, cast in the test), `ctx.fetch` through `effectsPlugin({ fetch: signalFetch })`, a `latest` handler cancelled by a newer call. Verify: `pnpm vitest run src/signal` fails against the old code and passes with 1.1.
- [x] 2.2 Add a type test in `src/tests/types.test.ts`: `signalFetch(ctx, url)` and `signalFetch({ signal }, url)` compile; `ctx.fetch(url)` from `effectsPlugin({ fetch: signalFetch })` has no `ctx` parameter and returns `Promise<Response>`; `signalFetch(signal)` and `fromSignal(signalFetch)` are errors (`@ts-expect-error` above the line TypeScript reports). Verify: `pnpm tsgo`.
- [x] 2.3 Add a `devPlugin` test: a request made through `signalFetch(ctx, url)` in a cancelled handler is not in `getLostSignals(bus)`, and a bare `fetch(url)` still is. Verify: the test passes in the existing dev test file (Node 22+, as the other request tests).
- [x] 2.4 Add to `src/tests/lint-recipes.test.ts` with `requireContext: true`: `await signalFetch(ctx, url);` is not reported, a bare `await fetch(url);` is. Verify: `pnpm vitest run src/tests/lint-recipes.test.ts`.

## 3. Docs (English)

- [x] 3.1 `docs/pass-the-signal.md`, "Bind the signal once": first `signalFetch(ctx, url)` in a handler (problem, when, what the call does, files in the style of the page), then `effectsPlugin({ fetch: signalFetch })` for `ctx.fetch` on every handler, then `fromSignal` for `axios` as the page has it; comment each nanoeffects call; fix the "On this page" list and the anchor links if headings change. Verify: `pnpm docs:check`.
- [x] 3.2 `docs/context.md` (the `signalFetch` bullet and its anchor), `docs/cancel-stale-requests.md` (the sentence with `fromSignal(signalFetch)`), `docs/policies.md` (the `ctx.fetch` sentence), and `docs/effects.md` if it names the old form: point to the effect form. Verify: `pnpm docs:check`.
- [x] 3.3 `docs/package.md`: the row of `nanoeffects/signal` says `signalFetch` is an effect (`signalFetch(ctx, url)`) and `fromSignal` builds a client. `docs/plugins.md` if it lists the exports of the entry. Verify: `grep -rn "fromSignal(signalFetch)\|signalFetch(signal" docs README.md llms.txt` returns nothing.
- [x] 3.4 `llms.txt`: update the descriptions that name `signalFetch` or `fromSignal`. Verify: `pnpm llms:check`.
- [x] 3.5 The comment "Bind the signal once with signalFetch" in `packages/create-nanoeffects/templates/*/src/bus.{js,ts}` (react, react-ts, vue-ts, svelte-ts, vanilla, vanilla-ts, domains-ts): say `signalFetch(ctx, url)`. Verify: `pnpm vitest run packages/create-nanoeffects` and `pnpm check`.

## 4. Docs (Russian)

- [x] 4.1 Mirror 3.1 to 3.3 in `docs/ru/` (read `RUSSIAN-DOCS.md` first; same code blocks, translated prose, anchors of the translated headings). Verify: `pnpm docs:check` and `pnpm vitest run tools/docs-site`.

## 5. Release notes and final check

- [x] 5.1 In `CHANGELOG.md` create `## Unreleased` above `## 0.34.0` with `### Breaking`: `signalFetch(signal)` is now the effect `signalFetch(ctx, input, init)`; `fromSignal(signalFetch)` becomes `effectsPlugin({ fetch: signalFetch })`, `signalFetch(signal)(url)` becomes `signalFetch({ signal }, url)`; link the docs anchor. Verify: `node scripts/release-notes.mjs` reads the section.
- [x] 5.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm size`. Verify: all pass; `signal (plugin)` limit in `package.json` is 0.81 kB and `pnpm size` is green.
