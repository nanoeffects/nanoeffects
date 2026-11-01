# Keep the signal through a handler

> **Level B.** Read first: [Policies](policies.md#latest).

A policy such as `latest` cancels an older call by aborting its `ctx.signal`. The handler stops only if every step that waits gets that signal. One request without it keeps running, and its result arrives after the newer one. This page lists the ways the signal gets lost, what catches each one before the code runs (a linter) and while it runs (`devPlugin`), and how to fix it.

## On this page

- [Know what the signal does](#know-what-the-signal-does)
- [Fix a handler that loses the signal](#fix-a-handler-that-loses-the-signal)
- [Pass the signal when it is hard](#pass-the-signal-when-it-is-hard)
- [Turn on the checks](#turn-on-the-checks)
- [Choose which calls are checked](#choose-which-calls-are-checked)
- [Count lost signals in a test](#count-lost-signals-in-a-test)
- [Prove it with a test](#prove-it-with-a-test)
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
| A library that takes no signal (a cache, a local database) | List it in `ignore`, or check only the calls on your list with `only`. With type information the rule skips a function that takes no signal on its own | `ignore`, `only`, types | |
| A function takes the signal and never uses it: `search(query, options) { return fetch(url); }` | Pass the signal on inside it. Only type information finds this in the linter; a test finds it for sure | types | |
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

## Choose which calls are checked

The rule cannot tell, from the call alone, whether the function takes a signal. Three ways to tell it:

- **`ignore`** lists the calls to skip, by name: `ignore: ["cache.get", "storage.*"]`. Use it when most calls take a signal and a few cannot.
- **`only`** lists the calls to check, by name: `only: ["api.*", "fetch"]`. Anything else is left alone, so a call that is not on the list is never reported. Use it when you know which clients take a signal. A call on both lists is skipped, and a pause that nothing can cancel (`await new Promise(...)`) is reported whatever `only` says.
- **Type information** needs no list. With `@typescript-eslint/parser` and a `project`, the rule reads the function it calls. A call that does not get the signal is reported only when the function takes one (a parameter typed `AbortSignal`, or an options object with `signal`), so `cache.get(key)` is left alone. A call that passes the signal is reported when the function is in your sources and never uses it: the parameter is unused, or only other options are read from it. A signal forwarded to another function of yours is followed up to three calls deep, and a function from a library is trusted. A callee typed `any` is reported as before.

<!-- docs-check: skip - a config file of the reader's project -->
```js
// eslint.config.mjs
import parser from "@typescript-eslint/parser";
import nanoeffects from "./nanoeffects-lint.mjs";

export default [
  {
    files: ["**/*.{ts,tsx}"],
    // the parser gives the rule the type checker of your project
    languageOptions: { parser, parserOptions: { project: "./tsconfig.json" } },
    plugins: { nanoeffects },
    rules: { "nanoeffects/policy-handler-uses-signal": "warn" },
  },
];
```

oxlint and Biome do not give a rule type information, so they use the syntax and the lists. The type-aware mode needs the `typescript` package with the compiler API (version 5 today; the native version 7 has none), as `@typescript-eslint/parser` does.

## Count lost signals in a test

`getLostSignals(bus)` from `nanoeffects/dev` returns how many signals the handlers of a bus lost: each emit or `ctx.on` that a handler made after its task was cancelled. The bus needs `devPlugin`. Run the flow the way a user would, cancel it, and check that the count is 0:

```js
import { createBus } from "nanoeffects";
import { devPlugin, getLostSignals, lostSignals } from "nanoeffects/dev";
import { latest } from "nanoeffects/policies";
import { expect, test } from "vitest";

test("a newer search leaves no lost signals", async () => {
  const bus = createBus();
  // devPlugin — records every emit that a cancelled handler made; log hides its warnings in the test
  bus.use(devPlugin({ log: () => {} }));
  bus.on(
    "search",
    latest(async (query, ctx) => {
      const items = await api.search(query, { signal: ctx.signal });
      ctx.emit("results", items);
    }),
  );

  bus.emit("search", "a");
  bus.emit("search", "ab"); // cancels the first call

  // wait — how long to let the handlers finish before counting, in ms
  const count = await getLostSignals(bus, { wait: 50 });

  expect(count).toBe(0);
});
```

`lostSignals(bus)` gives the list instead of the count: `{ kind: "emit" | "on", handler, event }` for each, so a failing test says which handler and which event. Without `devPlugin` (or with `abandoned: false`) it throws and says so. In a production build both functions are empty: the count is 0.

It counts what a handler does after the cancel. A request that a handler started and that the cancel did not stop is not counted unless the handler then emits; the next section finds those.

## Prove it with a test

A linter reads code; it cannot know what a function does with the signal. A test can. The idea: replace `fetch` with a server that answers after a moment and stops when the request's signal aborts, run the handler, cancel it in the middle of each step, and list the requests that did not stop.

<!-- docs-check: skip - a test file of the reader's project -->
```js
// search.cancel.test.js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { expect, test } from "vitest";
// copy prove-cancel.js from examples/lint; it needs no package
import { requestsThatKeptRunning } from "./prove-cancel.js";

test("a newer search stops the older one at every step", async () => {
  const bus = createBus();
  bus.on(
    "search",
    latest(async (query, ctx) => {
      const news = await api.news(query, { signal: ctx.signal });
      const posts = await api.posts(query, { signal: ctx.signal });
      ctx.emit("results", { news, posts });
    }),
  );

  // for each step: start a call, cancel it with a newer one, and collect the requests that did not stop
  const kept = await requestsThatKeptRunning((value) => bus.emit("search", value));

  // empty when every request got a signal that aborted with the handler
  expect(kept).toEqual([]);
});
```

`kept` has the url of each request that went on, the step where the handler was cancelled, and whether the request got a signal at all (`hadSignal: false`) or one that is not the handler's (`hadSignal: true`). This finds what the linter cannot: `api.posts` that takes `{ signal }` and ignores it, an `AbortSignal.timeout` in place of the handler's signal, a request in a branch you did not think of. It checks the boundary, `fetch`; for another client (axios, a database driver) stub that client in the same way. The repository tests the helper on handlers that forward the signal, ignore it, drop it at the third step, and use a signal of their own.

## Know what the checks cannot see

- **A handler that is not written in place.** `latest(searchHandler)` and `latest(withLogging(async (query, ctx) => ...))` are not read by the linter.
- **A callee that ignores the signal you pass.** Without type information the rule sees that you passed it, not what the callee does with it. With it, the rule reads callees in your sources; a library is trusted. The test above checks the real requests.
- **A handler that never emits.** `devPlugin` sees a lost signal by an emit after the cancel; a handler that only writes elsewhere is seen by the linter alone.
- **Shadowed names.** The rule uses no scope analysis, so an inner variable named `signal` can hide a lost signal.
