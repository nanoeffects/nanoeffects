# Choose the plugins of a bus

Optional. A plugin adds one thing to a bus: fields on `ctx`, a method, a registry of handlers, diagnostics. Read this page when you want to know which plugins exist, what each one returns, and in what order to use them. Skip it for a small bus: `createBus()` alone is enough.

## Use a plugin

A plugin is a function of the bus. `bus.use(plugin)` calls it with the bus and returns whatever the plugin returns.

```js
import { createBus } from "nanoeffects";

// your own plugin: a function of the bus that returns what you want back
const countPlugin = (bus) => {
  let count = 0;
  const unbind = bus.on("*", () => {
    count += 1;
  });
  return { count: () => count, stop: unbind };
};

const bus = createBus();
// use — calls countPlugin(bus) and returns its result
const counter = bus.use(countPlugin);

bus.emit("greet", "Ada");
console.log(counter.count()); // 1
counter.stop();
```

The bus keeps no list of plugins. A plugin that was used cannot be taken out by the bus; it returns its own `stop` or `disconnect` when it needs one.

## See every plugin

| Plugin | Import | It adds | `bus.use` returns | Page |
| ------ | ------ | ------- | ----------------- | ---- |
| `contextPlugin` | `nanoeffects` | Fields on `ctx` of every task | The same bus, typed with the fields | [Context fields](context.md) |
| `effectsPlugin` | `nanoeffects/effects` | `race`, `all`, `take`, `delay` and your own effects on `ctx`, bound to the task | The same bus, typed with the effects | [Effects](effects.md#put-selected-effects-on-ctx) |
| `scopePlugin` | `nanoeffects/scope` | Fields and effects for one command, action, job, module or `emit` | The same bus | [Scopes](scope.md) |
| `commandsPlugin` | `nanoeffects/actions` | The registry of command handlers, `bus.commands` | The registry `{ run, handle }` | [Actions](actions.md#describe-events-commands-and-jobs) |
| `modulePlugin` | `nanoeffects/actions` | Modules that mount and unmount as one unit | The app `{ mount, unmount, isMounted, dispose, commands, createModule }` | [Modules](actions.md#mount-domains-with-modules) |
| `emitterPlugin` | `nanoeffects/actions` | `bus.emitter(creator)`, a callback that emits an action | The same bus, with `emitter` | [Stores](stores.md#emit-from-a-state-manager) |
| `reactPlugin` | `nanoeffects/react` | `bus.useEmitter(event, value)`, a React hook | The same bus, with `useEmitter` | [React and stores](stores.md#react-sharing-a-value-across-components) |
| `devPlugin` | `nanoeffects/dev` | Warnings about listeners that pile up, and messages about modules | A function that disconnects it | [Hot reload](hmr.md#report-leaks-with-devplugin) |

"The same bus" means you can keep writing `bus` and ignore the result. Keep the result of `contextPlugin` and `effectsPlugin` in TypeScript, though: the type of the bus with its new fields is the type they return (`const bus = createBus().use(contextPlugin({ store }))`).

## Put them together

One bus with every plugin that does not need React. The order is explained in the next section.

```js
import { contextPlugin, createBus } from "nanoeffects";
import {
  commandsPlugin,
  emitterPlugin,
  modulePlugin,
} from "nanoeffects/actions";
import { devPlugin } from "nanoeffects/dev";
import { all, effectsPlugin, race } from "nanoeffects/effects";
import { scopePlugin } from "nanoeffects/scope";

const bus = createBus()
  .use(contextPlugin({ store })) // ctx.store on every task
  .use(effectsPlugin({ race, all })) // ctx.race and ctx.all, bound to the task
  .use(scopePlugin()) // scopes for commands, actions, jobs, modules and emit
  .use(emitterPlugin()); // bus.emitter(creator)

// commandsPlugin — the registry of command handlers; keep it to bind handlers later
const commands = bus.use(commandsPlugin());

// modulePlugin — mounts userModule now; keep app to mount and unmount later
const app = bus.use(modulePlugin([userModule]));

// devPlugin — reports leaks and modules while you develop; keep disconnect to remove it
const disconnect = bus.use(devPlugin({ app }));
```

## Follow the order

Most plugins do not care about each other. These pairs do:

| Rule | Why |
| ---- | --- |
| `scopePlugin` after `effectsPlugin` | `effectsPlugin` assigns its effects on `ctx`, so one used later would replace an effect with the same name that a scope put there. |
| `scopePlugin` before `modulePlugin` | `modulePlugin` mounts the modules when it is used, and a module with a scope needs the plugin by then. |
| `commandsPlugin` before `modulePlugin`, if you bind handlers yourself | `modulePlugin` uses the registry that exists. Without one it makes its own, which is `app.commands`. |
| `modulePlugin` before `devPlugin({ app })` | `devPlugin` reports the modules of the `app` that `modulePlugin` returned. |
| `emitterPlugin` and `reactPlugin` anywhere | They only call `bus.emit`, which is read when you call them. |

Two more things the checker enforces. A name that is already a context field of the bus is a type error when `contextPlugin` or `effectsPlugin` adds it again. `contextPlugin` does not replace a field that is on `ctx` already, so a scope wins over it in any order.

## Choose by need

- **A store, a client or a logger on every handler.** `contextPlugin`. Or `createBus({ context })` when you do not need the types from the value.
- **`race`, `all` or your own effect without passing `ctx`.** `effectsPlugin`.
- **Fields for one command, or a fake for one test call.** `scopePlugin`.
- **A request with a result, or handlers that a test can replace.** `commandsPlugin`. Add `modulePlugin` when the domain needs a mount and an unmount.
- **A callback for a state manager, such as `$name.listen(...)`.** `emitterPlugin`.
- **Tell the bus when a value of a React component changes.** `reactPlugin`.
- **Find listeners that were never unbound, or see modules reload.** `devPlugin`. In a production build `nanoeffects/dev` is empty, so the call can stay.

## See what is not a plugin

These connect the bus to something, but are not used with `bus.use`:

- `createEffectsMiddleware(bus, { filter })` from `nanoeffects/redux` is a Redux middleware for a bus that exists. See [Stores](stores.md#wire-redux-toolkit-to-a-bus).
- `createBus({ trace })` takes a tracer from `nanoeffects/trace`. See [Tracing](tracing.md).
- `createObserve(bus)` from `nanoeffects/observable` turns an event into an Observable. See [Observable](observable.md).
