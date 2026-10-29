# Choose a package entry

Imports are split so you only load what you use. `createBus` stays small; the rest is another entry.

| Import | What is in it |
| ------ | ------------- |
| `nanoeffects` | `createBus`, the types |
| `nanoeffects/policies` | `latest`, `leading`, `debounce`, `throttle`, `queue` |
| `nanoeffects/effects` | `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `effectsPlugin` |
| `nanoeffects/actions` | `createAction`, `createCommand`, `createJob`, `createModule`, `modulePlugin`, `commandsPlugin` |
| `nanoeffects/match` | `matchPlugin`: `on`, `once` and `off` that take a function which picks the events |
| `nanoeffects/context` | `contextPlugin`: your own fields (a store, a client) on `ctx` of every task, typed from the value |
| `nanoeffects/signal` | `signalPlugin`: `emit(call, { signal })` ties the tasks of an emit to an outside `AbortSignal` |
| `nanoeffects/oop` | `Emitter`, `extendBus`, `WithBus`, `On`, `Once`, `disposeBus`: the methods of a bus on a class, with the subscriptions of each instance ended by `dispose()` |
| `nanoeffects/scope` | `scopePlugin`, `effect`: fields for one command, action, job, module or `emit` (the types `Scope`, `Effect`) |
| `nanoeffects/redux` | `createEffectsMiddleware` |
| `nanoeffects/observable` | `createObserve`, `Subject` |
| `nanoeffects/react` | `reactPlugin`: adds the `useEmitter` hook to a bus (needs React 18 or newer) |
| `nanoeffects/vue` | `vuePlugin`: adds `watchEmitter` and `useEventRef` to a bus (needs Vue 3.3 or newer) |
| `nanoeffects/dev` | `devPlugin` (no-op in production) |
| `nanoeffects/trace` | `createTracer`, the loggers and `tracePlugin` (names for the trace) |

The `...Plugin` names above are used with `bus.use`. [Plugins](plugins.md) lists all of them, what each returns, and the order to use them in.

## Give the docs to an AI assistant

The package ships plain-text files for assistants that write code with it:

- `llms.txt`: a short index. It states the rules that generated code often gets wrong and links to every page of these docs.
- `llms-full.txt`: the same summary followed by the text of every linked page, in one file.
- `skills/nanoeffects/SKILL.md`: a skill for assistants that support skills (for example Claude Code). It says when to suggest nanoeffects, when not to, and the same rules. Copy the folder to `.claude/skills/` in your project or to `~/.claude/skills/`.

Find them in `node_modules/nanoeffects/`, or load `llms-full.txt` from a CDN such as `https://unpkg.com/nanoeffects/llms-full.txt`. All match the installed version.
