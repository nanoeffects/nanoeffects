# Documentation

Read the docs from the level of your project and stop when it has what it needs. Each level adds one idea. A page says at its top which level it is for and what to read first.

New here? Do these three things, in order:

1. **Decide.** Read the [README](../README.md) (two minutes): what the library is for, how to install it, a first working example. [Why nanoeffects exists](motivation.md) says when not to use it.
2. **Start.** Run the first example, or make a project with `npm create nanoeffects@latest my-app` ([Start a project from a template](starter.md)).
3. **Climb.** Follow the [Guide](guide.md) step by step, or look up your case in the [Recipes](recipes.md).

## The ladder, from A to F

| Level | Your project | You can stop here when | Read |
| ----- | ------------ | ---------------------- | ---- |
| **A** | A small app, widget or prototype with rare races | Events and handlers do the job | [Guide](guide.md#1-create-a-bus) steps 1 and 2 |
| **B** | A SPA with async UI: search, submit, leaving a page | A newer request must replace an older one | [Policies](policies.md), [Guide](guide.md#3-abort-the-previous-run-with-latest) steps 3 and 4 |
| **C** | An unreliable network or a long flow | Retries, timeouts and waiting are handled | [Effects](effects.md), [Guide](guide.md#5-add-retry-and-timeout) steps 5 and 6 |
| **D** | Domain logic that must live off the UI | Features are actions and modules, not components | [Actions, jobs and modules](actions.md), [Guide](guide.md#7-name-events-three-ways) steps 7 to 9 |
| **E** | An existing Redux, Zustand, MobX or Pinia app, or a data library | The bus runs the async work next to your store | [Stores](stores.md), [Query libraries](query-libraries.md) |
| **F** | A platform, an SDK or a long-lived app | You can see what ran, reload modules, rely on the rules | [Tracing](tracing.md), [Hot reload](hmr.md), [Semantics](semantics.md), [Stability](stability.md) |

A small app never needs level B or higher. Move up when the first problem of that level appears, not before.

## Start with three imports

Most apps need only these. Everything else is optional; read it when you hit its need.

| Import | Gives you |
| ------ | --------- |
| `nanoeffects` | `createBus`: `on`, `emit`, `ctx` |
| `nanoeffects/policies` | `latest`, `debounce`, ... for races in async UI |
| `nanoeffects/effects` | `retry`, `timeout`, `poll`, ... for an unreliable network |

The other entries and plugins: [Package entries](package.md) and [Plugins](plugins.md#pick-a-plugin-by-task).

Code for every guide step: [`examples/guide.ts`](../examples/guide.ts) (type-checked and tested).

## Jump by need

For a problem, start from [Recipes](recipes.md). For a project shape:

| Project shape | First page |
| ------------- | ---------- |
| Small app / widget (rare races) | [Guide § Create a bus](guide.md#1-create-a-bus) |
| SPA with async UI | [Policies](policies.md), [Guide § latest](guide.md#3-abort-the-previous-run-with-latest) |
| Unreliable network / long flows | [Effects](effects.md) — one helper per job, then the rest as reference |
| Domain logic off the UI | [Actions, handlers, modules](actions.md) |
| Already on Redux / Zustand / MobX / Pinia | [Stores](stores.md) |
| A Node server (Fastify) whose work must stop when the client leaves | [Stop work on a server](server.md) |
| A React form with async checks | [Build a sign-up form in React](react.md) |
| A site widget that listens only while open | [Build a chat widget](chat-widget.md) |
| A Vue app | [Use nanoeffects in a Vue app](vue.md) |
| A Svelte app | [Use nanoeffects in a Svelte app](svelte.md) |
| Old responses overwrite new ones | [Cancel stale requests](cancel-stale-requests.md) |
| Debounced input that must also cancel the old request | [Debounce and abort](debounce-and-abort.md) |
| A second click sends a second request | [Prevent a double submit](prevent-double-submit.md) |
| Using mitt, nanoevents or EventEmitter | [Coming from mitt](migrating-from-mitt.md) |
| Moving from redux-saga | [Coming from redux-saga](migrating-from-saga.md) |
| Using RxJS | [Use nanoeffects next to RxJS](migrating-from-rxjs.md) |
| Moving from Effector | [Coming from Effector](migrating-from-effector.md) |

## Reference

Look these up when you need the exact rule.

- [Package entries](package.md): which import holds what
- [Stability](stability.md): which entries are stable, what is breaking, supported versions
- [Plugins](plugins.md): every plugin of a bus, what it returns, and the order to use them in
- [Semantics](semantics.md): the exact rules of emit, abort and ordering
- [Tracing](tracing.md): loggers, Redux DevTools, `notrace`
- [Observable](observable.md): events as TC39 Observables
- [Hot reload and dev diagnostics](hmr.md)
