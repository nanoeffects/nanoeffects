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

## 4. Integration

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build` and verify all pass.
