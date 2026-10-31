# Semantics

Guarantees and sharp edges. Read when something surprises you; not required to start.

## Five rules to know first

1. A handler is `(payload, ctx)`. Use `ctx.signal`, `ctx.emit` and `ctx.on`; the rest of `ctx` is optional.
2. Pass `ctx.signal` to what the handler calls (`fetch`, a client), so an abort stops the work.
3. An aborted task delivers no result and emits nothing.
4. `emit` is synchronous: the first handler error is thrown, unless `onError` is set.
5. Rejections of async handlers are not handled without `onError`.

Details of each rule and the rest:

- **An aborted task delivers no result.** If the task aborts before a promise settles, the promise rejects with the abort reason, even if the value was just produced in the same tick. `latest`, `debounce`, `all`, `race`, `take`, and the rest follow this rule.
- **`emit` is a plain, synchronous loop** (see [Errors](errors.md)). A `ctx.emit` inside a handler is the same call: without `onError`, an error of a nested handler is thrown into the handler that emitted; with `onError` it goes there and `ctx.emit` does not throw.
- **Rejections of async handlers** are not handled for you. Without `onError` they are unhandled rejections, which end a Node process by default. Use `onError` for async handlers.
- **`leading` releases its lock when the task aborts**, not only when `fn` settles. A `fn` that ignores the abort signal can then overlap with the next run — pass `ctx.signal` to what `fn` does.
- **Effects start their function synchronously**, so an event emitted right after the call reaches a `take` inside it.
