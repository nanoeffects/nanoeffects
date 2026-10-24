# Design: contextPlugin

## Context

`createBus<Events>(options)` types the fields of `context` through `WithContext` in `Events`, because TypeScript cannot infer one type parameter from a value once another is given explicitly. A prototype with a second type parameter on `createBus` (outside the repo) infers fields only when the caller writes no type arguments, so it cannot serve a bus with an event map. `effectsPlugin` (`src/effects/plugin.ts`) already shows the way that works: a function of the bus that adds fields through `Bus.addContext` and returns the same bus typed `Bus<E & WithContext<…>>`, with a `NoClash` check on the `bus` parameter.

## Decisions

**1. A plugin, not a change of `createBus`.**

```ts
export const contextPlugin =
  <F extends object>(fields: F | ((task: { type: string; payload?: unknown }) => F)) =>
  <E extends EventMap>(bus: Bus<E> & NoClash<F, E>): Bus<E & WithContext<F>> => { … };
```

`F` is inferred from the argument. A prototype outside the repo checks: an explicit `Events = { "user/loaded": User }` keeps its payload types and gets `ctx.store`; a bus without events gets `ctx.store`; chaining with `effectsPlugin` gives both fields. `createBus` is not touched, so it does not grow and its type does not change.

**2. Runtime through `addContext`.** The plugin chains to the previous `bus.addContext` and, for each key of the fields (or of what the function returns for the task), sets the field if the context has no such key. The library fields exist on the context before `addContext` runs, so they win; a field set by an earlier source stays. The `context` option of `createBus` is applied while the context is made, before `addContext`, so it merges with the plugin by the same rule.

**3. Types merge by intersection.** `WithContext<A>` and `WithContext<B>` intersect into the key `A & B`, the way `WithContext<{ store }>` and the fields of `effectsPlugin` already do. `EventsOf<typeof bus>` and `Context<…>` follow without a change.

**4. A repeated name is a type error.** `NoClash<F, E>` is the check that `effectsPlugin` has (`keyof F & keyof ContextOf<E>` is `never`), moved to a place both plugins use, `src/core`, if that is simpler than copying it. The function form returns its fields at run time, so the check can only look at the keys of its return type.

**5. Where it is exported.** Options: the main entry `nanoeffects` (next to `createBus`), or `nanoeffects/actions` or `nanoeffects/effects` next to the other plugins. The plugin is small and does not belong to commands or effects, so the main entry is the natural place, but `createBus` has a size limit of 1.3 kB with `{ createBus }` imported. Measure it with `contextPlugin` exported from the same chunk: if the bundle of `createBus` alone grows, export the plugin from another entry. Decide at apply from the numbers, and record them here.

**6. The `context` option stays.** It is how JavaScript users and `createEffectsMiddleware` pass fields. The docs show the plugin as the typed way.

## Risks

- Runtime code instead of types only. It is a few lines in a file of its own.
- An order of plugins that matters only for the clash check: a repeated name is an error whichever comes first, but the error shows at the second use.
- The function form cannot be checked against the keys that the bus already has beyond the type of its return value.

## Open question

The export entry (decision 5), resolved by measurement at apply.
