# Proposal

## Why

The React playground is too heavy to read as an example. Its `bus.ts` holds a small store of its own (a request log, a trace list, listeners, `useSyncExternalStore`) only to draw logs on the page, next to a Redux DevTools logger. A reader who opens it to see the bus in React meets more machinery than bus. Redux DevTools is also confusing on StackBlitz: the editor shows its own instances there, and the one of the playground sits among them.

## What Changes

- Simplify `examples/playground-react/`: the bus, the `debounce` + `latest` handler, a component with one input and the results. The tracer is one constant (`createTracer(consoleLogger())`) passed to `createBus`; the abort is visible in the browser console. No list on the page, no own store, no Redux DevTools.
- Add a separate project, `examples/playground-devtools/`: the same search, traced to Redux DevTools with `reduxDevtools({ name })`, and a line in the page that says where to look and to pick the instance by its name.
- `examples/README.md` lists the three playgrounds.

## Capabilities

### New Capabilities

### Modified Capabilities
- `playground`: the React playground traces to the console only; a separate DevTools playground shows `reduxDevtools`.

## Impact

- `examples/playground-react/` (smaller), new `examples/playground-devtools/`, `examples/README.md`, `CHANGELOG.md`, the main spec `playground`.
- No change in `src/`, the package or `docs/`. The playgrounds use the published `nanoeffects`, so they do not use `nanoeffects/react` until a release has it.
