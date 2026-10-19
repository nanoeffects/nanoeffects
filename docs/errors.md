# Errors and unheard events

`emit` is a plain loop over the handlers, like in nanoevents: if a handler throws, the remaining handlers are skipped and the error reaches the caller of `emit`. A rejected promise of an async handler is left unhandled.

Pass `onError` to isolate handlers instead. Then every handler runs, and thrown errors and rejections of async handlers (including ones wrapped in `latest`, `debounce` and the like) go to `onError`; an `onError` that throws is logged to `console.error`.

```ts
const bus = createBus<Events>({
  onError: (error, { type, payload }) => report(error, type, payload),
});
```

## Events that nobody listens to

A typo in an event name, `emit("serch")`, does nothing and says nothing. `onUnhandled` is called when an event is emitted and nobody listens to it (a listener of every event, `"*"`, counts). It is not called for commands, which always have a handler to run. Use it as a warning in development:

```ts
const bus = createBus<Events>({
  onUnhandled: import.meta.env.DEV
    ? ({ type }) => console.warn(`Nobody listens to "${type}"`)
    : void 0,
});
```
