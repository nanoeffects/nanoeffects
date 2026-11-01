# Lint recipes: a handler of a policy that loses the signal

A policy such as `latest` cancels an older call by aborting its `ctx.signal`. A handler stops only when it passes the signal on: to `fetch(url, { signal })`, or the whole `ctx` to an effect (`retry(ctx, ...)`), or through `ctx.run`. These rules flag two ways to lose it, for a handler under `latest`, `leading`, `queue`, `debounce` or `throttle`:

```js
// 1. no ctx parameter at all
latest(async (query) => api.search(query));

// 2. ctx is taken, and the signal is lost: ctx is unused, or used only for emit and on
bus.on(
  "search",
  latest(async (query, ctx) => {
    const items = await api.search(query); // the signal is not passed
    ctx.emit("results", items);
  }),
);
```

| Tool | Files | Setup |
| --- | --- | --- |
| ESLint | `nanoeffects-lint.mjs`, `eslint.config.mjs` | import the plugin, turn on `nanoeffects/policy-handler-uses-signal` |
| oxlint | `nanoeffects-lint.mjs`, `.oxlintrc.json` | `jsPlugins` and the same rule name (oxlint runs ESLint-compatible plugins) |
| Biome | `policy-handler-needs-ctx.grit`, `policy-handler-loses-signal.grit`, `biome.json` | list both files in `plugins` |

The ESLint and oxlint rule is one file with no dependency. The Biome rules are two GritQL plugins. All of them flag the same seven calls of `fixture.js` and leave the others alone: `src/tests/lint-recipes.test.ts` runs the Biome rules and the plugin on that file and compares the lines. ESLint 9 and oxlint 1.90 were also run on it by hand with the same result.

## What the rules do not see

- A handler that is not written in place: `latest(namedHandler)` is not read.
- A signal that is lost in a way the syntax does not show, such as `ctx` passed to a function that ignores it. The Biome rules read text: a mention of `signal` in the handler counts as passing it on.
- A handler under a custom policy. Add its name to `policies` in `nanoeffects-lint.mjs`, or to the `or` lists of the `.grit` files.

To catch a handler that has `ctx` and does not pass `ctx.signal` on at run time, use `devPlugin` while you develop ([docs](../../docs/hmr.md#find-a-handler-that-ignores-the-signal)).
