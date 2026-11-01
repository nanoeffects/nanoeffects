# Keep the signal through a handler

> **Level B.** Read first: [Policies](policies.md#latest).

A policy such as `latest` cancels an older call by aborting its `ctx.signal`. The handler stops only if every step that waits gets that signal. One request without it keeps running, and its result arrives after the newer one. This page lists the ways the signal gets lost, what catches each one before the code runs (a linter) and while it runs (`devPlugin`), and how to fix it.

## On this page

- [Know what the signal does](#know-what-the-signal-does)
- [Fix a handler that loses the signal](#fix-a-handler-that-loses-the-signal)
- [Pass the signal when it is hard](#pass-the-signal-when-it-is-hard)
- [Turn on the checks](#turn-on-the-checks)
- [Know what the checks cannot see](#know-what-the-checks-cannot-see)

## Know what the signal does

`ctx.signal` is an `AbortSignal`. The policy aborts it when the call is cancelled (a newer call of `latest`, a `debounce` that was replaced, an unmounted module). A step stops when you give it the signal: `fetch(url, { signal: ctx.signal })`, `api.search(query, { signal: ctx.signal })`, or the whole `ctx` for an effect, `retry(ctx, ...)`. Everything else keeps running. The bus drops what a cancelled handler emits with `ctx.emit`, so the loss shows up late and quietly.

## Fix a handler that loses the signal

The two shapes you meet first, and the fix:

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// 1. ctx is taken and the signal is lost: the request cannot stop
bus.on(
  "search",
  latest(async (query, ctx) => {
    const items = await api.search(query);
    ctx.emit("results", items);
  }),
);

// 2. one step passes it and another does not: the first one cannot stop
bus.on(
  "feed",
  latest(async (query, ctx) => {
    const news = await api.news(query);
    const posts = await api.posts(query, { signal: ctx.signal });
    ctx.emit("results", { news, posts });
  }),
);

// the fix: every step that waits gets the signal
bus.on(
  "feed/fixed",
  latest(async (query, ctx) => {
    const news = await api.news(query, { signal: ctx.signal });
    const posts = await api.posts(query, { signal: ctx.signal });
    ctx.emit("results", { news, posts });
  }),
);
```

## Pass the signal when it is hard

Each row is a situation where the signal is easy to lose. The right column says how to keep it. "Lint" is the rule from [`examples/lint`](https://github.com/nanoeffects/nanoeffects/tree/main/examples/lint) that flags it, and "devPlugin" is the warning at run time ([details](hmr.md#find-a-handler-that-ignores-the-signal)).

| Situation | What to do | Lint | devPlugin |
| --------- | ---------- | :--: | :-------: |
| The handler has no `ctx`: `latest(async (query) => ...)` | Take `(query, ctx)` and pass `ctx.signal` | yes | |
| `ctx` is taken and never used for the request | Pass `{ signal: ctx.signal }` to each request | yes | yes |
| One step passes the signal, another does not | Pass it to every step | yes | yes |
| The signal is in a variable: `const options = { signal: ctx.signal }` | Nothing, a variable that holds it counts | accepted | |
| Calls run together: `Promise.all([a(), b()])` | Pass it to each call, not only one | yes | |
| `Promise.all(ids.map((id) => load(id)))` | Pass it inside the callback | yes | |
| The step is inside an effect: `retry(ctx, () => api.search(q))` | The callback is not given the signal. Pass `{ signal: ctx.signal }` in it, or use the child context it gets | yes | |
| `timeout(ctx, 1000, (child) => api.search(q))` | Pass `child`, or `child.signal`, to the request | yes | |
| `ctx.run((child) => api.search(q))` | Pass `child` | yes | |
| A pause: `await new Promise((r) => setTimeout(r, 1000))` | Use `delay(ctx, 1000)` | yes | |
| A stream: `for await (const x of api.stream(q))` | Pass the signal to `api.stream` | yes | |
| A chain: `api.news(q).then(...)` | Pass the signal to the first call | yes | |
| Another signal: `AbortSignal.timeout(5000)`, or the signal of your own `AbortController` | Join it with the handler's: `AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)])` | yes | |
| Reading a response body: `await response.json()` | Nothing, the signal of the request stops it | accepted | |
| A library that takes no signal (a cache, a local database) | Leave it out with the rule's `ignore` option, or a disable comment | `ignore` | |
| The signal is wired by hand: `signal.addEventListener("abort", ...)` | Nothing, the handler is not checked step by step | accepted | |
| `bus.emit` in a handler | Use `ctx.emit`: only it is dropped after the handler was cancelled | yes | |
| Results emitted after the cancel | The handler ignored the signal. Pass it, or check `ctx.signal.aborted` | | yes |
| `ctx.on` after the cancel | The same | | yes |

The pause and the effect rows in code:

```js
import { createBus } from "nanoeffects";
import { delay, retry, timeout } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

bus.on(
  "search",
  latest(async (query, ctx) => {
    // delay — a pause that stops with ctx, not new Promise(setTimeout)
    await delay(ctx, 300);

    // retry — the attempts stop with ctx, but the request needs the signal too
    const items = await retry(ctx, () => api.search(query, { signal: ctx.signal }));

    // timeout — the callback gets a child context: give it to the request
    const details = await timeout(ctx, 5000, (child) => api.details(query, child));

    ctx.emit("results", { items, details });
  }),
);
```

Calls that run together, and a signal that joins another:

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

bus.on(
  "feed",
  latest(async (query, ctx) => {
    // each call of the group gets the signal, not only the first
    const [news, posts] = await Promise.all([
      api.news(query, { signal: ctx.signal }),
      api.posts(query, { signal: ctx.signal }),
    ]);

    // AbortSignal.any — stops with the handler or after 5 seconds, whichever comes first
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)]);
    const details = await api.details(query, { signal });

    ctx.emit("results", { news, posts, details });
  }),
);
```

## Turn on the checks

**While you write.** [`examples/lint`](https://github.com/nanoeffects/nanoeffects/tree/main/examples/lint) has a rule for ESLint and oxlint (one file, no dependency) and two GritQL plugins for Biome. Copy the file, turn the rule on, and give it the names of calls that cannot be cancelled:

<!-- docs-check: skip - a config file of the reader's project -->
```js
// eslint.config.mjs
import nanoeffects from "./nanoeffects-lint.mjs";

export default [
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    plugins: { nanoeffects },
    rules: {
      "nanoeffects/policy-handler-uses-signal": [
        "warn",
        // calls that take no signal and are fine to wait for
        { ignore: ["cache.get", "storage.*"] },
      ],
    },
  },
];
```

For oxlint list the file in `jsPlugins` of `.oxlintrc.json` and use the same rule name. For Biome list the two `.grit` files in `plugins`. The Biome plugins read text, so they flag the direct steps (the first rows above) and miss the deeper ones: the calls of `Promise.all`, the callbacks of effects, `for await`, a pause, and the key of an options object.

**While you run.** `devPlugin` warns once when a handler emits, or subscribes with `ctx.on`, after its task was cancelled:

```js
import { createBus } from "nanoeffects";
import { devPlugin } from "nanoeffects/dev";

const bus = createBus();

// devPlugin — warns about a handler that kept running after it was cancelled; nothing in production
bus.use(devPlugin());
```

## Know what the checks cannot see

- **A handler that is not written in place.** `latest(searchHandler)` and `latest(withLogging(async (query, ctx) => ...))` are not read by the linter.
- **A callee that ignores the signal you pass.** The rule sees that you passed it, not what the callee does with it.
- **A handler that never emits.** `devPlugin` sees a lost signal by an emit after the cancel; a handler that only writes elsewhere is seen by the linter alone.
- **Shadowed names.** The rule uses no scope analysis, so an inner variable named `signal` can hide a lost signal.
