# Choose a package entry

> **Levels A to F.** Read first: [README](../README.md).

Imports are split so you only load what you use. `createBus` stays small; the rest is another entry.

## Start with these three

| Import | What is in it |
| ------ | ------------- |
| `nanoeffects` | `createBus`, the types |
| `nanoeffects/policies` | `latest`, `leading`, `debounce`, `throttle`, `queue` |
| `nanoeffects/effects` | `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `effectsPlugin` |

## Add the rest when you need it

Each row is optional. The "when" column says what need brings you to it.

| Import | What is in it | When |
| ------ | ------------- | ---- |
| `nanoeffects/actions` | `createAction`, `createJob`, `createModule`, `modulePlugin`, `actionsPlugin` | `emit` must return a result, or domain logic leaves the UI |
| `nanoeffects/match` | `matchPlugin`: `on`, `once` and `off` that take a function which picks the events | `on` must take a function that picks events |
| `nanoeffects/context` | `contextPlugin`: your own fields (a store, a client) on `ctx` of every task, typed from the value | a store or client must be on every task |
| `nanoeffects/signal` | `signalPlugin`: `emit(call, { signal })` ties the tasks of an emit to an outside `AbortSignal`; `fromSignal` and `signalFetch`: a client or a `fetch` made from the signal of each task | an outside `AbortSignal` (request, React Query) must stop tasks, or a handler must not pass the signal by hand |
| `nanoeffects/oop` | `Emitter`, `extendBus`, `WithBus`, `On`, `Once`, `disposeBus`: the methods of a bus on a class, with the subscriptions of each instance ended by `dispose()` | you write classes, not functions |
| `nanoeffects/scope` | `scopePlugin`, `effect`: fields for one action, job, module or `emit` (the types `Scope`, `Effect`) | one action or module needs its own fields |
| `nanoeffects/redux` | `createEffectsMiddleware` | you already use Redux |
| `nanoeffects/observable` | `createObserve`, `Subject` | you need an Observable (RxJS) |
| `nanoeffects/react` | `reactPlugin`: adds the `useEmitter` hook to a bus (needs React 18 or newer) | React components |
| `nanoeffects/svelte` | `sveltePlugin`: adds `eventStore` to a bus (needs Svelte 5 or newer) | Svelte components |
| `nanoeffects/vue` | `vuePlugin`: adds `watchEmitter` and `useEventRef` to a bus (needs Vue 3.3 or newer) | Vue components |
| `nanoeffects/dev` | `devPlugin` (no-op in production), `getLostSignalsCount` and `getLostSignals` for tests | you look for leaks and lost signals in development and in tests |
| `nanoeffects/trace` | `createTracer`, the loggers (`graphLogger` finds event loops) and `tracePlugin` (names for the trace) | you want to see what ran and why |
| `nanoeffects/testing` | `createMarbleBus`, `fakeTimersClock`: a bus for tests, with emits and phases as diagrams | you test `latest`, `debounce`, `queue`, `retry` or `timeout` with fake timers |
| `nanoeffects/guard` | `loopGuardPlugin`: refuses the emit that would pass a limit of a chain | a loop must not take the app down |

The `...Plugin` names above are used with `bus.use`. [Plugins](plugins.md) lists all of them, what each returns, and the order to use them in.

## Give the docs to an AI assistant

The package ships plain-text files for assistants that write code with it:

- `llms.txt`: a short index. It states the rules that generated code often gets wrong and links to every page of these docs.
- `llms-full.txt`: the same summary followed by the text of every linked page, in one file.
- `skills/nanoeffects/SKILL.md`: a skill for assistants that support skills (for example Claude Code). It says when to suggest nanoeffects, when not to, and the same rules. Copy the folder to `.claude/skills/` in your project or to `~/.claude/skills/`.

Find them in `node_modules/nanoeffects/`, or load `llms-full.txt` from a CDN such as `https://unpkg.com/nanoeffects/llms-full.txt`. All match the installed version.
