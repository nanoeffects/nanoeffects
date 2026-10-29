# Tasks

## 1. The hook

- [x] 1.1 Add `useEventState` with its three overloads to `ReactApi` and `reactPlugin` in `src/react/plugin.ts`, with a doc comment and `@example`; verify with `pnpm tsgo`.
- [x] 1.2 Tests in `src/react/plugin.test.ts`: first render returns `initial`, lazy `initial` runs once, an event sets the state, an equal payload does not re-render, a function payload is stored not called, `setState` sets locally and emits nothing, unmount leaves no listener, StrictMode leaves one listener, a changed `event` resubscribes, the free hook `const { useEventState } = bus`. Verify with `pnpm vitest run src/react`.
- [x] 1.3 Type tests in `src/tests/types.test.ts`: the state type from a name, from a `FreeActionCreator` and from an `ActionCreator<P>`; a wrong `initial` and an unknown event with `@ts-expect-error`. Verify with `pnpm tsgo`.
- [x] 1.4 `src/tests/plugin-matrix.test.ts` already installs `reactPlugin` (line 171): add a probe that `useEventState` is on the bus in every plugin order. Verify with `pnpm vitest run src/tests/plugin-matrix.test.ts`.

## 2. Docs and size

- [x] 2.1 Add a section to `docs/react.md` (level B, JS first): the problem of `useEffect(() => bus.on(searchLoaded, setFound), [])`, then `useEventState(searchLoaded, [])` with each nanoeffects call commented, the limit that events before the commit are missed, and a pointer to `useEmitter` as the opposite direction. Verify with `pnpm docs:check`.
- [x] 2.2 Update the `nanoeffects/react` line in `llms.txt` and add the `CHANGELOG.md` entry under `Unreleased` (`### Added`). Verify with `pnpm llms:check`.
- [x] 2.3 Measure `pnpm build && pnpm size`; raise the `react` limit in `package.json` only by the measured growth. Verify `pnpm size` passes.

## 3. Starter template

- [x] 3.1 Rewrite `packages/create-nanoeffects/templates/react/src/App.jsx` and `bus.js` to use `useEventState` instead of `useState` + `useEffect(() => bus.on(...))`, and update the `react` row of `docs/starter.md`. The template depends on `nanoeffects@latest`, so it works for new projects only after the release that has the hook: check the template with `pnpm consumer-check` against the packed tarball, and verify `pnpm vitest run packages/create-nanoeffects`.

## 4. State type from initial

- [x] 4.1 Change the three overloads of `useEventState` (the `ReactApi` type and the function in `src/react/plugin.ts`) so the state type is `unknown extends E[K] ? Widen<S> : E[K]` with `S` inferred from `initial` (or the function that returns it); keep the helper types internal. Verify with `pnpm tsgo`.
- [x] 4.2 Type tests in `src/tests/types.test.ts`: on a bus with no event map, `["a"]` gives `string[]`, `[]` gives `unknown[]`, a lazy `() => ({ n: 1 })` gives `{ n: number }`; with a known payload `"Adam"` stays `string`, a wrong `initial` is still rejected with `@ts-expect-error`, and the existing tests pass unchanged. Verify with `pnpm tsgo`.
- [x] 4.3 Add a note to the `useEventState` section of `docs/react.md`: the state type comes from the event, or from `initial` when the event has no payload type, and an empty `[]` is `unknown[]`, so pass a typed initial or a typed creator when you need more. Verify with `pnpm docs:check`.
- [x] 4.4 Check that `found` in `packages/create-nanoeffects/templates/react/src/App.jsx` is no longer `any` (for example with a scratch project that type-checks the template with `checkJs` against the built package), and adjust the template only if it is not. Verify with `pnpm vitest run packages/create-nanoeffects`.

## 5. Integration

- [x] 5.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build` and verify all pass.
