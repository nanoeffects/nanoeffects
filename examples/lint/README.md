# Lint recipes: a handler of a policy that forgot the context

A handler under `latest`, `leading`, `queue`, `debounce` or `throttle` that is written with no `ctx` parameter has no way to pass `ctx.signal` to its request, so it keeps running after the policy cancels it. Two rules flag it before the code runs. They are checked against `fixture.ts` by `src/tests/lint-recipes.test.ts`.

- **Biome**: copy `policy-handler-needs-ctx.grit` and add it to `plugins` in your `biome.json` (see `biome.json` here). It is a GritQL plugin.
- **ESLint**: add the `no-restricted-syntax` entry of `eslint.config.mjs`. It needs no plugin. The selector was checked on the same fixture with ESLint 9.

Both flag the first four calls of `fixture.ts` and leave the others alone. They read only handlers written in place: `latest(namedHandler)` is not checked. To catch a handler that has `ctx` but never passes `ctx.signal` on, use `devPlugin` while you develop ([docs](../../docs/hmr.md#find-a-handler-that-ignores-the-signal)).
