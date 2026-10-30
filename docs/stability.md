# Know what is stable

Use this page to decide what you can rely on. It says which imports are stable, what counts as a breaking change, which versions are supported, and which call forms stay.

## See which entries are stable

A stable entry follows the rules below. An unstable entry can change in any minor release; every change is written in the [CHANGELOG](../CHANGELOG.md), and nothing promises a deprecation period first.

| Import | Status | Note |
| ------ | ------ | ---- |
| `nanoeffects` | Stable | `createBus` and the types of a bus |
| `nanoeffects/effects` | Stable | `retry`, `timeout`, `poll`, `take`, `delay`, `all`, `allSettled`, `race`, `backoff`, `cancellable`, `effectsPlugin` |
| `nanoeffects/policies` | Stable | `latest`, `leading`, `debounce`, `throttle`, `queue`, `withPolicy` |
| `nanoeffects/actions` | Stable | `createAction`, `createCommand`, `createJob`, `createModule` and their plugins |
| `nanoeffects/trace` | Stable: the contract | `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase`, `EffectName` and `tracePlugin` |
| `nanoeffects/trace` | Unstable: the tools | `createTracer`, `consoleLogger`, `performanceLogger`, `createTraceRecorder`, `reduxDevtools` and their option types |
| `nanoeffects/scope` | Unstable | `scopePlugin`, `effect` |
| `nanoeffects/match` | Unstable | `matchPlugin` |
| `nanoeffects/signal` | Unstable | `signalPlugin` |
| `nanoeffects/context` | Unstable | `contextPlugin` |
| `nanoeffects/oop` | Unstable | `Emitter`, `extendBus`, `On`, `Once`, `WithBus`, `disposeBus` |
| `nanoeffects/observable` | Unstable | `createObserve`, `Subject` |
| `nanoeffects/redux` | Unstable | `createEffectsMiddleware` |
| `nanoeffects/react` | Unstable | `reactPlugin`, `usePolicy` |
| `nanoeffects/svelte` | Unstable | `sveltePlugin` |
| `nanoeffects/vue` | Unstable | `vuePlugin` |
| `nanoeffects/dev` | Unstable | `devPlugin` |

The adapters (`react`, `vue`, `svelte`, `redux`) are unstable because they follow the APIs of other libraries and have had little use. They can become stable after the library has been in use for a while.

## Know what is a breaking change

For a stable entry, these changes are breaking:

- A change in what a call does at run time.
- A change in a type that stops code that compiled before from compiling.
- A removed or renamed export.

A stricter type that only finds mistakes in code that was already wrong is not breaking. It ships in a minor release with a note in the CHANGELOG.

These are not covered by the promise:

- Any unstable entry.
- The text of the messages of `nanoeffects/dev`.
- The payload details of trace events. The shape of an event (`id`, `parentId`, `rootId`, `type`, `effect`, `phase`) is covered; the contents of `payload` are not.

Before version 1.0.0, a breaking change ships in a minor release under `### Breaking` in the CHANGELOG. From 1.0.0 it ships only in a major release.

A deprecated export keeps working and is removed only in a major release. `RaceStarter` is deprecated: use `StarterOf` instead.

## Check the supported versions

| What | Supported |
| ---- | --------- |
| Node.js, the library | 18, 20, 22 and 24 (a smoke test runs the built package on each) |
| Node.js, the dev tools and the trace in a browser | 22 and newer |
| TypeScript | 5.9 and 7. The built declaration files are type-checked with TypeScript 5.9 in CI, and the source with TypeScript 7. Older versions are not tested. |
| React | 18 or newer (`nanoeffects/react`) |
| Vue | 3.3 or newer (`nanoeffects/vue`) |
| Svelte | 5 or newer (`nanoeffects/svelte`) |

The library has no dependencies. React, Vue and Svelte are optional peer dependencies of their own entries only.

## Rely on these call forms

`retry`, `timeout` and `poll` have three call forms, and all three stay:

```js
import { createBus } from "nanoeffects";
import { race, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  // with ctx: you pass the context, the function gets the signal
  const user = await retry(ctx, ({ signal }) => fetchUser(id, { signal }), { times: 3 });

  // as a starter: a group (race, all, allSettled, timeout) calls it with its child
  const result = await race(ctx, {
    user: retry((_, { signal }) => fetchUser(id, { signal }), { times: 3 }),
  });
});

// as a Task: a function of (payload, ctx), which bus.on and ctx.run call
bus.on("reload", retry((id, { signal }) => fetchUser(id, { signal }), { times: 3 }));
```

The forms are told apart by the arguments: a context first is the form with `ctx`; a function called with a payload and a context is the Task; the same function called by a group with one argument, its child, is the starter. The rule is part of the contract and does not depend on how many parameters your function declares.

`all` and `allSettled` take options only in the form with `ctx`, `all(ctx, effects, { concurrency })`. The form without `ctx` has one argument, so a second one would look like the `ctx` form. `race` takes no `concurrency`: it ends at the first result, so a starter that waited for a free slot would never run. See [Effects](effects.md#run-several-starters-together).
