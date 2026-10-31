# Handle errors and unheard events

> **Level B.** Read first: [Guide](guide.md#1-create-a-bus) steps 1 and 2.

Defaults match a small bus. Set these when you want isolation or typo warnings.

## Isolate failing handlers

`emit` is a plain loop over the handlers (like nanoevents). If a handler throws, the remaining handlers are skipped and the error reaches the caller of `emit`. A rejected promise of an async handler is left unhandled.

Pass `onError` to isolate handlers instead. Then every handler runs. Thrown errors and rejections of async handlers (including those wrapped in `latest`, `debounce`, and the like) go to `onError`. An `onError` that throws is logged to `console.error`.

```js
import { createBus } from "nanoeffects";

// createBus — onError isolates failing handlers so others still run
const bus = createBus({
  onError: (error, { type, payload }) => {
    report(error, type, payload);
  },
});
```

## Warn when nobody listens

A typo in an event name (`emit("serch")`) does nothing and says nothing. `onUnhandled` runs when an event is emitted and nobody listens (a listener of every event, `"*"`, counts). It is not called for an action that has a handler to run. An action without a handler is only an event, so it is called for it.

Use it as a warning in development (`import.meta.env.DEV` is the Vite flag; use your own check in another bundler):

```js
import { createBus } from "nanoeffects";

const bus = createBus({
  onUnhandled: import.meta.env.DEV
    ? ({ type }) => console.warn(`Nobody listens to "${type}"`)
    : void 0,
});
```
