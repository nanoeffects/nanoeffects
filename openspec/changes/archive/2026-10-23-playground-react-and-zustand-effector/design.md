# Design

## Context

`examples/playground/` is a Vite project (`index.html`, `main.ts`, `fake-api.ts`, own `package.json`); the README link opens it on StackBlitz by path. StackBlitz opens one folder, so a project cannot import from a sibling folder. The root `tsconfig.json` includes `examples`, has no `jsx` option, and the root has no React types; `docs/react.md` blocks are checked through stubs (`declare module "react"`). `zustand` is already a root dev dependency, so `docs:check` can verify a Zustand block for real.

## Goals / Non-Goals

**Goals:**
- A React reader sees the search flow in a component with one click.
- The Effector page shows the Zustand replacement in code.
- All gates (`tsgo`, `check`, `docs:check`, `llms:check`, `pack`) keep passing.

**Non-Goals:**
- No change to `src/`, no new package entry, no adapter for Zustand.
- No second demo in the README; no new docs page (so `llms.txt` stays as is).
- No Zustand version of the Effector form example.
- No new tracer, logger or bus API: tracing in the playground uses the existing `nanoeffects/trace` exports.

## Decisions

1. **A separate folder, `examples/playground-react/`, not a second page in `examples/playground/`.** StackBlitz opens the folder's default page, so a second page would hide behind a link; two folders give two plain links. Cost: `fake-api.ts` is copied (about 30 lines). Alternative rejected: one folder with `react.html` and a switch, because a React-only dependency set would load for the DOM reader too.
2. **React runtime deps live only in the playground's `package.json`** (`react`, `react-dom`, `vite`, `@vitejs/plugin-react`). The root gets only `@types/react` as a dev dependency and `"jsx": "react-jsx"` so `pnpm tsgo` type-checks the `.tsx` files. Alternative rejected: exclude the folder from `tsgo`, because the README snippet would then be unchecked.
3. **Component shape:** `bus.ts` (module-level bus, `debounce` + `latest` handler, same as `examples/search.ts`), `App.tsx` (`useState` for the log and last result, `useEffect` subscribing with `bus.on` and returning the unsubscribe), `main.tsx`, `index.html`. The fake API reports into the bus (`bus.emit("request", …)`) so the log is a normal listener, not a callback tied to the DOM.
4. **Zustand example in the Effector page** goes under "Rewrite an effect", after the nanoeffects snippet, in JS: `create` for the store (replaces `createStore([]).on(searchFx.doneData, …)`), the `latest` handler calls `useSearchStore.setState({ items })` instead of emitting `found`, a small component reads `useSearchStore((state) => state.items)`. The page's existing sentence "Keep it in Effector, or replace it with any store such as Zustand" then points at it. The `found` event stays in the plain snippet above, so that snippet is not edited.
5. **React sources in `stores.md`** go in "Emit from a state manager" as a new subsection before "Callbacks on every change". `useState`: a `useEffect` on the value calls `bus.emit`; a second effect holds `bus.on` and returns the unsubscribe; the result comes back through the setter. `useDispatch`: with `createEffectsMiddleware(bus)` the action already reaches the bus; the handler returns the result with `ctx.store.dispatch`. Both are JS; `react` and `react-redux` blocks are skipped or stubbed as `scripts/docs-stubs.d.ts` does for `react` (add `react-redux` there if needed). Alternative rejected: a new docs page, because the Stores page is where a reader with a store looks.
6. **Playground tracing:** `createBus({ trace: createTracer([...]) })` with a small function logger for the in-page list (`createTraceRecorder` keeps a plain array that React cannot subscribe to), `consoleLogger()` for the console and `reduxDevtools()` for the extension; exact export names are confirmed in `src/trace/index.ts` at apply time. Redux DevTools lives in the browser extension and is usually not visible inside the StackBlitz preview frame, so the in-page list is the part that always works and the README sentence says to open the preview in its own tab for the extension.
7. **Assumption:** "devtools" means the tracing already in the library (Redux DevTools logger plus an in-page list), not `nanoeffects/dev` diagnostics. Change this if `devPlugin` messages were meant.
8. **Assumption:** "an example based on Zustand" means the search flow "an example based on Zustand" means the search flow (the first Effector example), not the form; the form already uses `useState`. Change this if the form was meant.

## Risks / Trade-offs

- Copied `fake-api.ts` can drift from the DOM one. Mitigation: a header comment in both; the files are small and the spec compares only the handler wiring.
- `jsx` in the root `tsconfig.json` could affect other files. Mitigation: only `.tsx` files read it, and the project has none besides the playground.
- The extension may not work in the StackBlitz frame; the in-page list covers it.
- The README link needs the React folder on the default branch before it works. Same as the DOM link today.
