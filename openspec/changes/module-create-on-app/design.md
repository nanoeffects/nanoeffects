# Design: createModule on the app

## Context

`modulePlugin` (`src/actions/module.ts`) is `<E>(modules) => (bus: Bus<E>): ModuleApi<E>`. `ModuleApi<E>` has `commands`, `mount`, `unmount`, `isMounted` and `dispose`, all typed with `E`. `createModule<E>(name, setup)` is `({ name, setup })`: it needs `E` only for the type of `setup`. The plugin returns the API, not the bus, so the API is where a typed helper has to live.

A plugin that refines the bus returns the typed bus (`effectsPlugin`); a plugin that attaches an API returns the API (`modulePlugin`, `emitterPlugin`'s `bus.emitter` is the exception that adds to the bus). `app.createModule` follows `modulePlugin`: it is part of its API.

## Decisions

**1. A field of `ModuleApi<E>`, written by hand.**

```ts
createModule: (name: string, setup: (m: ModuleContext<E>) => void) => Module<E>;
```

The plugin returns `createModule: (name, setup) => createModule<E>(name, setup)`, or the function itself, since `createModule<E>` is assignable: `createModule`. No runtime cost beyond one property.

**2. No runtime link, no mount.** The result is the plain `{ name, setup }`. A module file stays free of side effects, can be mounted on another app (a test app, a second bus), and hot reload (`docs/hmr.md`) is unchanged. A `createAndMount` was considered and dropped: it hides the mount, and `app.mount(module)` is one line.

**3. The order of files.** `app.createModule` needs `app` before the module and `modulePlugin([userModule])` needs the module before `app`. The way out is `bus.use(modulePlugin())` with no modules in `bus.ts`, `app.createModule` in the module files, and `app.mount(userModule)` in the entry:

```ts
// bus.ts
export const bus = createBus<Events>({ context: { store } }).use(effectsPlugin({ race }));
export const app = bus.use(modulePlugin());

// user.ts
export const userModule = app.createModule("user", (m) => {
  m.handle(getUser, (id, { store, signal }) => store.fetchUser(id, { signal }));
});

// main.ts
app.mount(userModule);
```

There is no import cycle: `bus.ts` imports no module. `modulePlugin(modules)` with a list stays for the case where the modules do not need the app.

**4. Not a `createCommand` on the app.** The command needs the same type for its handler only when the handler is carried by the command. The contract (`createCommand<Payload, Result>(type)`) plus `m.handle` in a module needs nothing. A bound `createCommand` copies a creator and its overloads and is not added.

**5. Not on `bus`.** `modulePlugin` brings modules; the bus stays small.

## Risks

- A second way to create a module. The docs say `app.createModule` is for an app with its own types in several files; `createModule` stays for one file and for libraries that make modules without a bus.
- The module is typed with the bus of the app that created it. Mounting it on an app with another event map is a type error, as it is for `createModule<E>` today.

## Open question

None blocking.
