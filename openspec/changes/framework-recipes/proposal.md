# Proposal: a React recipe (registration form) and a Pinia recipe

## Why

A reader on React or Vue has the bus and the policies but not the part that decides whether they can adopt it: where the bus lives, how a component subscribes and cleans up, and what a real screen looks like. Today `docs/stores.md` covers Redux, Zustand, MobX, Jotai, Valtio and Nanostores, and there is no page for React or for Pinia (the store of Vue). A registration form is the clearest case for level B and E readers: a username check that must not race, a submit button that must not fire twice, and a flaky network.

## What Changes

- A new page `docs/react.md`: a registration form that uses `debounce` + `latest` for the username availability check, `leading` so a second click on "Sign up" is ignored while the first is running, `retry` for a network error, and `ctx.signal` for every request. The nanoeffects part is plain JS first; the React part is a component and one hook that subscribes in `useEffect` and unbinds on unmount. The page says where the bus is created (once, outside the render) and why.
- A framework-free example, `examples/registration-form.ts`, with the same bus wiring, type-checked by `pnpm tsgo` and tested with fake timers (one request for fast typing, a stale answer dropped, a double submit ignored, a retry on a network error). The React page uses this wiring, so what the page teaches is what the test runs.
- `docs/stores.md`: every store of "Emit from a state manager" gets its own subsection with its own snippet (imports, creating the store, the one subscription line), in place of one block of alternatives that `docs:check` has to skip. The new Pinia subsection uses `watch(() => store.name, emitNameChanged)` (because `$subscribe` reports every mutation and not one field) and shows how a handler writes the result back to the store. The title and first lines name Pinia.
- `docs/README.md` and `llms.txt` link the new page (`pnpm llms:check` requires the second). The title and first lines of `docs/stores.md` name Pinia.
- `scripts/docs-check.mjs` also checks `jsx` and `tsx` fences, lets a block name its file with a first-line comment (`// name-bus.js`) so a later block can import it,  and `scripts/docs-stubs.d.ts` declares the `react` and `pinia` modules, so the new snippets are checked like the others without installing React or Pinia.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `docs-snippet-check`: fences marked `jsx` and `tsx` are checked too, as plain JavaScript and TypeScript blocks respectively. (The capability is added by the change `user-dx`; this delta applies once that change is archived.)

## Non-goals

- Anything in `src/`, a `nanoeffects/react` entry, a `useBus` hook in the package, or bindings for Vue (a composable) and Angular. The recipes show the plain code a reader writes.
- Installing `react`, `react-dom`, `vue` or `pinia` in the repository, or integration tests with them (`integration/` stays as it is).
- Changes to the README (level A and B only: the new page is reached from `docs/`).
- Server-side rendering, React Native, and React-specific state libraries other than the plain `useState`.
- An Angular recipe (a separate question: RxJS already covers much of the same ground there).

## Impact

- New: `docs/react.md`, `examples/registration-form.ts`, `src/tests/registration-form.test.ts`.
- Edited: `docs/stores.md`, `docs/README.md`, `llms.txt`, `scripts/docs-check.mjs` (+ its test), `scripts/docs-stubs.d.ts`, `AGENTS.md` (the sentence on checked fences), `CHANGELOG.md`.
- `llms-full.txt` grows by one page (built, not committed).
