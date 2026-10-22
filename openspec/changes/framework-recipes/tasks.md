# Tasks

## 1. Spikes

- [x] 1.1 Confirm that `user-dx` is archived (`openspec/specs/docs-snippet-check/` exists); if not, pause and ask the owner to run `/opsx:archive user-dx`. (It is not archived: task 5.3 of `user-dx` waits for a push. The owner chose to go on; archive `user-dx` before archiving this change.)
- [x] 1.2 Decide how an in-flight task ends on unmount (design decision 3): try the candidates in a scratch test, pick the shortest correct one, write the result into design.md.
- [x] 1.3 Read `src/effects/retry.ts` and `docs/effects.md` for the option that tells which errors to retry; write the exact name into design.md (decision 4).

## 2. Checker: JSX fences

- [x] 2.1 `scripts/docs-check.mjs`: accept `jsx` and `tsx` fences, write them as `.tsx` with `jsx: "preserve"`; `jsx` follows the plain-JS rule.
- [x] 2.2 `scripts/docs-stubs.d.ts`: open `JSX.IntrinsicElements`, `declare module "react"`, `declare module "pinia"`, `declare module "vue"`.
- [x] 2.3 Tests in `scripts/docs-check.test.mjs` (also: a block names its file and another imports it; an unnamed import still fails): a `jsx` block with a component passes; a removed export in a `jsx` block fails; an undeclared module fails; a `tsx` block reports a type error.

## 3. The registration example

- [x] 3.1 `examples/registration-form.ts`: `createRegistration(api)` with the username check (`debounce` + `latest` + `ctx.signal`), submit (`leading` + `retry` for network errors), events for the form state; a comment on every nanoeffects call, in the style of `examples/search.ts`.
- [x] 3.2 `src/tests/registration-form.test.ts` with fake timers: one request for fast typing; a stale answer dropped; a second submit ignored while the first runs; a network error retried and a "name taken" error not retried; the unmount behaviour found in 1.2.

## 4. Pages

- [x] 4.1 `docs/react.md`: problem first (races, double submit, flaky network, where the bus lives), then the plain-JS wiring, then the hook and the form in JSX, then the cleanup rule. Level B/E, JS first, names local to each snippet, each nanoeffects call commented, a link to the example and its test.
- [x] 4.2 `docs/stores.md`: turn the five-alternatives block into one subsection per store (Nanostores, MobX, Valtio, Jotai, Zustand), each self-contained and importing `emitNameChanged` from a `// name-bus.js` block; add the Pinia subsection (`watch` of a getter, write the result back); name Pinia in the title and the first lines. No skip marker is left in that section. Add a table of contents at the top of the page ("On this page"), and keep the link to `examples/redux.ts` inside the Redux section, not in the intro.
- [x] 4.3 Link the new page from `docs/README.md` (by need and in the reference) and from `llms.txt`.
- [x] 4.4 `pnpm docs:check` and `pnpm llms:check` pass with the new blocks checked, not skipped (a skip needs a reason).

## 5. Wrap up

- [x] 5.1 `AGENTS.md`: the sentence on checked fences lists `jsx` and `tsx`. `CHANGELOG.md`: entries for the React page, the Pinia recipe and the `jsx` check.
- [x] 5.2 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; it must pass.
