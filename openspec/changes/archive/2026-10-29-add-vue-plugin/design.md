# Design

## Context

`reactPlugin` (`src/react/plugin.ts`) is the model. It adds `useEmitter` (emit when a value changes, never on mount, with `equals`, `traceId` and `traceGroupId`; the root of the emit comes from `originKey`, which `tracePlugin` fills) and `useEventState` (the last payload of an event as state; the type from the event or from `initial`). `react` is an optional peer dependency, the `react` entry has its own `size-limit`, is not in the `notrace` build, is skipped by `scripts/smoke.mjs` when React is missing, and `src/tests/architecture.test.ts` lets only `src/react` import it. `vue@3.5` and `vue-tsc` are dev dependencies of the repository since `vue-ts`. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- The same two jobs, with the same behavior and options, in the idiom of Vue: `watch*` and `use*`, refs, effect scopes.
- Nothing is added to a project that does not use Vue.

**Non-Goals:**
- Anything that Vue's own `watch` already does (deep watching, flush timing): `watchEmitter` passes its source to `watch` and keeps its defaults.
- A `usePolicy` for Vue.

## Decisions

- **Methods on the bus, taken out by destructuring.** The same shape as `reactPlugin`, so the bus file of a project reads the same in both frameworks: `export const { watchEmitter, useEventRef } = bus`. A plain function that imports the bus would not work for a bus the project does not own.
- **`watchEmitter` is a thin `watch`.** `watch(source, (value, previous) => emit(value))`, with `equals` checked first and the emit made through `originKey` when `tracePlugin` set it and through `bus.emit` otherwise, as `useEmitter` does. A `watch` runs on change and not on mount, and stops when its effect scope stops, so there is no flag and no cleanup to write. It returns the stop function that `watch` returns, for use outside a component. Vue's default `Object.is` comparison already skips an equal primitive; `equals` is for a new object with the same fields.
- **`useEventRef` is a `shallowRef` and a listener.** `shallowRef(initial)` stores the payload as it is: no deep reactivity, and a function payload is kept as a value. `onScopeDispose(bus.on(event, listener))` is the whole cleanup, because `bus.on` returns the unsubscribe function. The state is not a store: an event before the call is lost, as in React, and the docs and the template comment say so.
- **The type of the state.** The conditional type that gives the state its type (the payload type, or the widened type of `initial` when the payload is `unknown`) is the same for both frameworks, so it moves from `src/react/plugin.ts` to a small type file in `src/core` and both entries import it. No change for React users.
- **Overloads.** The three of `useEmitter`: an event name of the map, a creator with no payload type, and a creator with a payload type.
- **A peer dependency of `>=3.3`.** The plugin uses `watch`, `shallowRef`, `onScopeDispose` and the `WatchSource` type, which exist in 3.3 and later; the tests run on the 3.5 of the repository.
- **Tests without a DOM.** Both methods work in an effect scope, so a test makes a scope with `effectScope()`, runs the method in it, changes a `ref`, awaits `nextTick` and stops the scope. No component is mounted, which keeps the test short and fast.
- **Package wiring as for React.** `exports` has `./vue`, `tsdown.config.ts` has an entry and `vue` is ignored by its unused check, `peerDependencies` and `peerDependenciesMeta` have `vue` (optional), `size-limit` has an entry that ignores `vue`, the root `tsconfig.json` maps `nanoeffects/vue` to `src`, `smoke` imports the entry only where `vue` is installed, the architecture test lets only `src/vue` import `vue`, and the entry has no `notrace` build, since it has no tracing code of its own.
- **The matrix.** `plugin-matrix.test.ts` gets `vuePlugin` as a plugin with a probe that both methods are on the bus, in every order.
- **The template.** `bus.ts` of `vue-ts` uses `vuePlugin()` and takes out the two methods; `App.vue` calls `watchEmitter(query, queryChanged)` and `useEventRef(searchLoaded, [])` with the not-a-store comment next to it; `use-event-ref.ts` and the hand-written `watch` go. `Notes.vue` stays as it is: it uses `withPolicy`, not the plugin.
- **Docs.** One page, `docs/vue.md`, built as the guide to the entry: the problem, what each method does, the not-a-store limit, and a pointer to the starter. It is linked from `docs/package.md`, `docs/starter.md` and `llms.txt`.

## Risks / Trade-offs

- [A second framework entry doubles what is kept in step] → the shared type is one definition, the options are the same type, and the tests of both entries state the same rules.
- [`vue-ts` is made before the release and does not compile] → the release ships the entry and the template together; `templates:check` type-checks the template against `src`.
- [`watchEmitter` batches changes that happen before the next tick] → it is the flush behavior of `watch`; the spec says once for each change that is seen, and the docs say that several changes in one tick emit once.
- [A `ref` that holds an object that is changed in place does not trigger `watch`] → the same as in plain Vue; the docs name it.

## Open Questions

None that change the specs.
