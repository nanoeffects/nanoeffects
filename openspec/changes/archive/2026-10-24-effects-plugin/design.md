# Design: effectsPlugin

## Context

`bus.use(plugin)` is `plugin(bus)`. Free effects take `ctx` first and read the task through it (`signal`, trace parent by identity), so a bound helper needs the real task `ctx`, not a copy. Context fields come from `BusOptions.context` and are spread before library fields in `createTask`.

## Decisions

**1. `bus.addContext` hook instead of branding.** `Bus` has an optional `addContext?: (ctx) => void`. `createTask` calls `bus?.addContext?.(ctx)` once after `asContext(...)`. Child tasks (`ctx.run`, effect attempts, `forkTask`) go through `createTask`, so they get the helpers too. Cost without a plugin: one property read. A branded-symbol scan of every field (previous draft) is dropped.

**2. Plugin.**

```ts
export const effectsPlugin = <H extends Helpers>(helpers: H) =>
  <E extends EventMap>(bus: Bus<E>): Bus<E & WithContext<Bound<H, E>>> => {
    const previous = bus.addContext;
    bus.addContext = (ctx) => {
      previous?.(ctx);
      for (const [key, effect] of entries) Object.assign(ctx, { [key]: (...args) => effect(ctx, ...args) });
    };
    return bus;
  };
```

Keys are the fixed names of the supported effects, so they cannot clash with library fields. A name that is already a context field is a type error (`NoClash` on the `bus` parameter); at runtime the helper would win.

**3. Types by hand.** `Helpers` is `{ race, all, allSettled, take, delay }` as a type map, not inferred from overloads:

```ts
type Bound<H, E> = { [K in keyof H]: BoundOf<K, E> }  // lookup table per supported name
```

Each entry is a short signature without the `ctx` parameter (`take` uses `E` for event keys). A helper outside the table is a type error. This replaces `OverloadPair` / `UnionToIntersection` / `bivarianceHack`.

**4. Casts.** One cast remains: `return bus as Bus<…>`, because the plugin refines only the type. `Bus.addContext` is writable by design (a documented plugin slot like `commands`), so no `WritableContext` cast and no `Record` casts.

**5. Plugin return convention.** A plugin that refines the bus shape returns the same bus typed; API plugins return their API. Written as one line in `AGENTS.md`; no spec requirement.

## Risks

- `addContext` is a second slot plugins may write; chaining via `previous` keeps plugins independent.
- One closure per helper per task. Acceptable for the small fixed set; measured in the leak test.
- Helpers that are not ctx-first-only (`retry`, `timeout`, `poll`) are excluded on purpose.

## Migration

Additive. Free forms keep working.
