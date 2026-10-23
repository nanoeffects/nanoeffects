# Proposal

## Why

The StackBlitz playground shows the search example in plain DOM code only. Most readers who open it write React, and `docs/react.md` is the page they read next. They cannot see the same bus inside a component without installing anything. `docs/migrating-from-effector.md` also tells a reader to replace `$items` with "any store such as Zustand" but never shows it, so the one step that is not nanoeffects is left to guess.

## What Changes

- Add a second StackBlitz project, `examples/playground-react/`: the same search (`debounce` + `latest`, fake API, log of started / aborted / finished requests) as a React component. The bus lives in its own module; the component subscribes in `useEffect` and unsubscribes on cleanup.
- Keep `examples/playground/` (DOM) as it is. README keeps one playground link and gets a second short link to the React one in the same sentence.
- Add a Zustand version of the Effector search to `docs/migrating-from-effector.md` ("Rewrite an effect"): the Zustand store replaces `$items`, the handler writes to it, a component reads it.
- Add a "React: `useState` and `useDispatch` as sources" subsection to `docs/stores.md` ("Emit from a state manager"): a component whose `useState` value and Redux `dispatch` start the bus handlers.
- Show tracing in the React playground: an in-page list of traced tasks, and Redux DevTools when the extension is present.
- Make the root type check understand JSX and React types (`@types/react` as a dev dependency, `jsx` in `tsconfig.json`), so `pnpm tsgo` covers the React playground.
- CHANGELOG entry.

## Capabilities

### New Capabilities
- `docs-effector-migration`: what the "Coming from Effector" page must show a reader who keeps state in a store other than Effector.
- `docs-react-sources`: what the Stores page must show a reader whose updates start in React (`useState`, Redux `useDispatch`).

### Modified Capabilities
- `playground`: the playground now has a React variant besides the DOM one.

## Impact

- New: `examples/playground-react/` (also traces; adds nothing to the core) (not published; own `package.json` with `react`, `react-dom`, `vite`, `@vitejs/plugin-react`).
- Changed: `README.md` (one link), `docs/migrating-from-effector.md`, `docs/stores.md` (+ its "On this page" list), possibly `examples/redux.ts`, `CHANGELOG.md`, `tsconfig.json`, root `package.json` (`@types/react` dev dependency), `pnpm-lock.yaml`.
- No change in `src/`, in the published package, or in bundle size.
