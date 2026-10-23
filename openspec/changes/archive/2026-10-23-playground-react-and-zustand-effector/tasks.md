# Tasks

## 1. Type-check setup

- [x] 1.1 Add `@types/react` to root `devDependencies` (`pnpm add -D @types/react`) and `"jsx": "react-jsx"` to `tsconfig.json`; `pnpm tsgo` still passes.

## 2. React playground

- [x] 2.1 Create `examples/playground-react/` with `package.json` (`nanoeffects`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react`), `vite.config.ts`, `index.html`, `main.tsx`.
- [x] 2.2 Add `fake-api.ts` (copy of the DOM one, with a note) and `bus.ts`: module-level bus, `debounce` + `latest` wiring identical to `examples/search.ts`, a comment on each library call.
- [x] 2.3 Add `App.tsx`: input, log of started / aborted / done requests, last result; subscribe with `bus.on` in `useEffect` and return the unsubscribe.
- [x] 2.4 Run it with Vite; type fast (one request), then type during a request (the old one is aborted); check unmount removes the listener.
- [x] 2.5 `pnpm check` and `pnpm tsgo` pass; `pnpm pack --dry-run` lists no playground file.

- [x] 2.6 Create the bus with a tracer: a logger for an in-page task list (start / done / cancel / error), `consoleLogger()` for the console, `reduxDevtools({ name })` for the extension; a comment on each library call.
- [x] 2.7 Show the trace list in `App.tsx`; check an aborted request appears as cancelled, and the page works with no extension.

## 3. README and changelog

- [x] 3.1 README: add the React playground link to the existing playground sentence (still one sentence, no new section); no mention of tracing beyond a few words.
- [x] 3.2 CHANGELOG: entry for the React playground and the Zustand example.

## 4. Effector page

- [x] 4.1 In "Rewrite an effect" of `docs/migrating-from-effector.md`, add the Zustand version: store replaces `$items`, handler writes with `setState`, component reads with a selector; every name defined in the block; a comment on each nanoeffects call; link to `stores.md`.
- [x] 4.2 Adjust the sentence after the nanoeffects snippet to point at the new example.
- [x] 4.3 `pnpm docs:check` and `pnpm llms:check` pass; the new block is not skipped.

## 5. React sources in Stores

- [x] 5.1 In `docs/stores.md` add "React: useState and useDispatch as sources" under "Emit from a state manager" and to "On this page": problem first (where does the bus call go in a component), then the `useState` effect pair, then `useDispatch` with the effects middleware; every name defined; a comment on each nanoeffects call.
- [x] 5.2 Add `react-redux` to `scripts/docs-stubs.d.ts` if a block imports it; run `pnpm docs:check` and `pnpm llms:check`.

## 6. Verify

- [x] 6.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build` pass; `pnpm verify` passes.
