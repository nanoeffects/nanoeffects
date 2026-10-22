# Design

## Context

`docs/stores.md` has one section for Redux (checked, with a tested example), and "Emit from a state manager", whose five-alternatives block is skipped by `docs:check` (none of the libraries is installed). `scripts/docs-check.mjs` (change `user-dx`) writes each `js`/`ts` fence to a `.ts` file, so JSX is a syntax error there. React, Vue and Pinia are not dependencies of the repository, and `integration/` has tests only for libraries that are. `docs/context.md` and the Redux recipe already show `createBus({ context: { store } })`. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- The recipe is checked and its nanoeffects part is tested, without adding React or Pinia to the repository.
- A reader can copy the hook and the form and has no question left about where the bus lives and when it is cleaned up.

**Non-Goals:**
- A real React renderer in tests. The component is a thin layer over events that the test drives directly.

## Decisions

**1. The behavior lives in a framework-free example that is tested; the React page wraps it.**
`examples/registration-form.ts` exports `createRegistration(api)`, which builds the bus and wires `debounce` + `latest` for the username, `leading` + `retry` for submit, and returns the bus with the event names. A vitest test with fake timers covers it. The React page shows the same wiring in plain JS (a reader copies JavaScript) and the hook that subscribes. Alternative: test with `@testing-library/react`. Rejected: it adds React, react-dom and a DOM environment to the repository to test glue of a few lines.

**2. Where the bus lives.**
The page states one rule: create the bus once, outside render (module scope, or `useState(() => createRegistration(api))`), never in the body of a component, because every render would create a new bus and lose its subscribers. Subscribe in `useEffect` and return the unbind function; React StrictMode runs the effect twice in development, which is correct because the unsubscribe is symmetric.

**3. Cancelling in-flight work on unmount (spike result, task 1.2).**
Unbinding a listener does not abort a task that already started, and unmounting a module does not abort a running handler task either (both tried in a scratch test). What works is the task's own subscription: the component emits `form/closed` on unmount, and each handler that must stop begins with `ctx.on("form/closed", () => ctx.abort())`. `ctx.on` is removed when the task ends, so nothing leaks, and a task aborted this way delivers no result. The page says so in one short subsection and shows the two lines.

**4. Submit: `leading` for the double click, `retry` only for network errors.**
`leading(fn)` drops new calls while a run is going, which is the double-submit rule. `retry(ctx, fn, { times: 3, delay })` wraps only the request, and an error that is not a network error (a 409 "name taken") is thrown out of the retry, using `retry`'s `shouldRetry(error, attempt)` option (found in `src/effects/retry.ts`, task 1.3). A failed `fetch` rejects with a `TypeError`; an HTTP status error is an ordinary `Error` and is not retried.

**5. One subsection per store (the owner's decision), Pinia among them.**
Each of Nanostores, MobX, Valtio, Jotai, Zustand and Pinia gets an `###` heading and a snippet that imports what it uses: the shared `emitNameChanged` from the `name-bus.js` block, the store library, and the one line that subscribes. Mobx, Jotai and Zustand are devDependencies already, so their snippets are checked against real types; Nanostores, Valtio, Pinia and Vue are declared in the stub file. Nothing is skipped.

**5a. Pinia: `watch` of a getter, not `$subscribe`.**
`store.$subscribe` calls back on every mutation of the store with `(mutation, state)`, which is not "one field changed to this value". Vue's `watch(() => store.name, callback)` calls back with the new value, which fits `bus.emitter(action)`. The snippet imports `watch` from `vue`, and `defineStore` from `pinia`, both declared in the stub file. Writing back: a handler sets `store.saved = true` through a closure over the store; `createBus({ context: { store } })` is mentioned in one line with a link to `docs/context.md`, not repeated.

**6a. A block can name its file.**
Subsections of one page need the same few lines (`emitNameChanged`) and AGENTS.md wants every snippet to define its names. A block whose first line is a comment with a file name (`// name-bus.js`) is written under that name in the temporary folder, and a later block imports it (`import { emitNameChanged } from "./name-bus"`). The same trick lets the React component import the bus of the previous snippet. A name that no block gives stays an unresolved import and fails. Alternative: one long block per page: rejected, that is the five-alternatives block this change removes.

**6. `jsx`/`tsx` support in the checker is small.**
`jsx` blocks go to `block-N.tsx` and `tsx` to the same, with `jsx: "preserve"` and a global `JSX.IntrinsicElements` open type in the stub file, so `<form>` and `<input>` need no React types. The `react` and `pinia` modules are declared as ambient modules (`declare module "react";`, which types every import as `any`). `jsx` follows the plain-JS rule (only stale-name errors are reported). Alternative: skip JSX blocks. Rejected: the form is the main snippet of the page.

**7. The change depends on `user-dx`.**
The delta modifies `docs-snippet-check`, which `user-dx` adds. Task 1 checks that `user-dx` is archived; if it is not, the delta cannot be applied and the owner archives it first.

## Risks / Trade-offs

- [The component is not type-checked against real React types] → the stub makes `react` imports `any`; what is checked is the nanoeffects calls, names and imports, which is what `docs:check` is for. Said on the page where it matters (the hook).
- [The React snippet and `examples/registration-form.ts` drift] → the page names the example and the test file; the wiring text is copied from it in task 3, and a short review checks it. No automatic comparison (the playground test needed one because a single block was shown twice; here the page has more JSX around it).
- [Pinia behaviour claims are wrong without Pinia installed] → written from the documented API only (`watch` on a getter, `defineStore`); one sentence per claim, no version-specific details.
- [The page grows into a React tutorial] → the page ends at the form and a "what to do next" link; a hook that is not needed by the form is not shown.

## Open Questions

- None that change the specs. How to cancel on unmount is decided in task 1 (decision 3).
