# Lint rules: a policy handler that loses the signal

A policy such as `latest` cancels an older call by aborting its `ctx.signal`. A handler stops only when every step that waits gets the signal. The rules flag, for a handler written in place under `latest`, `leading`, `queue`, `debounce` or `throttle`:

- a handler with **no `ctx` parameter**;
- a **step that does not pass the signal on**: `await call`, `return call`, an arrow body that is a call, `for await (x of call)`, `await new Promise(...)`, each call of `Promise.all([...])`, and the calls inside the callbacks of `retry`, `timeout`, `poll`, `all`, `race` and `ctx.run`. A step is checked even when another step of the same handler passes the signal;
- a **`bus.emit(...)`** in the handler: only `ctx.emit` is dropped after the cancel.

```js
latest(async (query, ctx) => {
  const news = await api.news(query); // the signal is lost
  const posts = await api.posts(query, { signal: ctx.signal });
  ctx.emit("results", { news, posts });
});
```

What counts as passing the signal: `signal` or `ctx.signal` in the arguments, a variable that was set from them (`const options = { signal: ctx.signal }`), or `ctx` itself as an argument (`retry(ctx, ...)`). Another signal does not count: `AbortSignal.timeout(5000)` and the signal of an `AbortController` of your own are reported unless joined with `AbortSignal.any([ctx.signal, ...])`. A call on ctx, the read of a response body (`response.json()`), and a handler that wires the signal by hand (`signal.addEventListener("abort", ...)`) are not reported. The full list of situations is in [Keep the signal through a handler](../../docs/pass-the-signal.md).

| Tool | Files | Setup |
| --- | --- | --- |
| ESLint | `nanoeffects-lint.mjs`, `eslint.config.mjs` | import the plugin, turn on `nanoeffects/policy-handler-uses-signal` |
| oxlint | `nanoeffects-lint.mjs`, `.oxlintrc.json` | `jsPlugins` and the same rule name (oxlint runs ESLint-compatible plugins) |
| Biome | `policy-handler-needs-ctx.grit`, `policy-handler-loses-signal.grit`, `biome.json` | list both files in `plugins` |

The ESLint and oxlint rule is one file with no dependency, and it takes `ignore`: callee names that cannot be cancelled, such as `{ ignore: ["cache.get", "db.*"] }`. The Biome rules are two GritQL plugins that read text, so they flag the direct steps and `bus.emit`, and miss the deeper cases (`Promise.all` elements, effect callbacks, `for await`, a pause, the key of an options object). `src/tests/lint-recipes.test.ts` runs the Biome rules and the plugin on `fixture.js` and compares the lines; the plugin is also tested on about thirty situations written inline. ESLint 9 and oxlint 1.90 were run on the fixture by hand with the same result as the plugin test.

## What the rules do not see

- A handler that is not written in place: `latest(namedHandler)` is not read.
- A callee that ignores the signal you pass, or `ctx` passed to a function that ignores it.
- Shadowed names: the plugin uses no scope analysis.
- A handler wrapped by another function: `latest(withLogging(async (query, ctx) => ...))`.
- A handler under a custom policy. Add its name to `policies` in `nanoeffects-lint.mjs`, or to the `or` lists of the `.grit` files.

To catch a handler that has `ctx` and does not pass `ctx.signal` on at run time, use `devPlugin` while you develop ([docs](../../docs/hmr.md#find-a-handler-that-ignores-the-signal)).
