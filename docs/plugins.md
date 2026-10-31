# Choose the plugins of a bus

Optional. A plugin adds one thing to a bus: fields on `ctx`, a method, a registry of handlers, diagnostics. Read this page when you want to know which plugins exist, what each one gives you, and in what order to use them. Skip it for a small bus: `createBus()` alone is enough.

## On this page

- [Use a plugin](#use-a-plugin)
- [Main plugins](#main-plugins)
  - [Put a store or a client on every handler: `contextPlugin`](#put-a-store-or-a-client-on-every-handler-contextplugin)
  - [Use `race` and `delay` without `ctx`: `effectsPlugin`](#use-race-and-delay-without-ctx-effectsplugin)
  - [Bind or replace a handler: `actionsPlugin`](#bind-or-replace-a-handler-actionsplugin)
  - [Mount a domain as one unit: `modulePlugin`](#mount-a-domain-as-one-unit-moduleplugin)
- [Extra plugins](#extra-plugins)
  - [Give one action its own fields: `scopePlugin`](#give-one-action-its-own-fields-scopeplugin)
  - [Tie an emit to an outside signal: `signalPlugin`](#tie-an-emit-to-an-outside-signal-signalplugin)
  - [Name the origin and the flow of a trace: `tracePlugin`](#name-the-origin-and-the-flow-of-a-trace-traceplugin)
  - [Listen to a group of events: `matchPlugin`](#listen-to-a-group-of-events-matchplugin)
  - [Hand the bus to a state manager: `emitterPlugin`](#hand-the-bus-to-a-state-manager-emitterplugin)
  - [Tell the bus when a React value changes: `reactPlugin`](#tell-the-bus-when-a-react-value-changes-reactplugin)
  - [Find leaks while you develop: `devPlugin`](#find-leaks-while-you-develop-devplugin)
- [Put them together](#put-them-together)
- [Use them in any order](#use-them-in-any-order)
- [See what is not a plugin](#see-what-is-not-a-plugin)
- [Write your own plugin](#write-your-own-plugin)

## Use a plugin

A plugin is a function of the bus. `bus.use(plugin)` calls it with the bus and returns whatever the plugin returns. Most plugins return the same bus, so you can chain them: `createBus().use(a).use(b)`. A few return something of their own (a registry, an app, a `disconnect` function): keep it.

In TypeScript keep the result of `contextPlugin` and `effectsPlugin`: the type of the bus with its new fields is the type they return (`const bus = createBus().use(contextPlugin({ store }))`).

## Main plugins

These four cover what most apps need: shared dependencies, effects, handlers and modules. Start here.

| Plugin | What it gives you | Import | `bus.use` returns |
| ------ | ----------------- | ------ | ----------------- |
| [`contextPlugin`](#put-a-store-or-a-client-on-every-handler-contextplugin) | Your own fields (a store, a client, a logger) on `ctx` of every handler. | `nanoeffects` | The same bus, typed with the fields |
| [`effectsPlugin`](#use-race-and-delay-without-ctx-effectsplugin) | `race`, `all`, `delay` and your own effects on `ctx`, called without passing `ctx`. | `nanoeffects/effects` | The same bus, typed with the effects |
| [`actionsPlugin`](#let-a-test-replace-a-handler-commandsplugin) | The handlers of actions in a registry, so a test can bind or replace one. | `nanoeffects/actions` | The registry `{ run, handle }` |
| [`modulePlugin`](#mount-a-domain-as-one-unit-moduleplugin) | A module: the listeners, handlers and tasks of one domain, mounted and unmounted with one call. | `nanoeffects/actions` | The app `{ mount, unmount, isMounted, dispose, actions, createModule }` |

### Put a store or a client on every handler: `contextPlugin`

Every task gets the same fields on `ctx`: a store, an API client, a logger. The types come from the values. More in [Context fields](context.md).

```js
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";

// contextPlugin — every handler gets ctx.store
const bus = createBus().use(contextPlugin({ store }));

bus.on("save", (draft, { store }) => store.put(draft));
```

### Use `race` and `delay` without `ctx`: `effectsPlugin`

Effects such as `race`, `all`, `take` and `delay` are bound to the task, so a handler calls `race({ … })` and not `race(ctx, { … })`. Your own functions that take `{ signal }` first work too. More in [Effects](effects.md#put-selected-effects-on-ctx).

```js
import { createBus } from "nanoeffects";
import { delay, effectsPlugin, race } from "nanoeffects/effects";

// effectsPlugin — race and delay are bound to the task of each handler
const effects = effectsPlugin({ race, delay });

const bus = createBus().use(effects);

bus.on("load", async (id, { race, delay }) => {
  const result = await race({
    data: (child) => api.get(id, child),
    timeout: () => delay(5000),
  });
});
```

### Bind or replace a handler: `actionsPlugin`

Handlers of actions can live in a registry that belongs to the bus. An action can have no handler, and a test or another layer binds one. More in [Actions](actions.md#bind-a-handler-later).

```js
import { createBus } from "nanoeffects";
import { actionsPlugin, createAction } from "nanoeffects/actions";

const getUser = createAction("user/get"); // no handler yet: an event
const bus = createBus();

// actionsPlugin — the registry of handlers of this bus
const actions = bus.use(actionsPlugin());

actions.handle(getUser, async (id) => ({ id })); // the latest binding wins
const user = await bus.emit(getUser("1")); // { id: "1" }
```

### Mount a domain as one unit: `modulePlugin`

A module groups the listeners, the bound handlers and the background tasks of one domain, and ends all of them when it is unmounted. It also makes [hot reload](hmr.md) work. More in [Modules](actions.md#mount-domains-with-modules).

```js
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";

const bus = createBus();

// modulePlugin — mounts userModule at the end of this block, or at the first use if that is earlier, and returns the app
const app = bus.use(modulePlugin([userModule]));

app.unmount(userModule); // its listeners, bound commands and tasks are gone
```

## Extra plugins

Add one of these when you meet its need. None of them is required.

| Plugin | What it gives you | Import | `bus.use` returns |
| ------ | ----------------- | ------ | ----------------- |
| [`scopePlugin`](#give-one-action-its-own-fields-scopeplugin) | Its own fields for one action, job or module, and a way to replace them in one `emit`. | `nanoeffects/scope` | The same bus |
| [`signalPlugin`](#tie-an-emit-to-an-outside-signal-signalplugin) | `emit(call, { signal })` that aborts its tasks when an outside signal aborts. | `nanoeffects/signal` | The same bus, typed with the new `emit` |
| [`matchPlugin`](#listen-to-a-group-of-events-matchplugin) | `on` that listens to a group of events which a function picks. | `nanoeffects/match` | The same bus, typed with the new overloads |
| [`emitterPlugin`](#hand-the-bus-to-a-state-manager-emitterplugin) | A callback that emits an action, to give to a state manager. | `nanoeffects/actions` | The same bus, with `emitter` |
| [`tracePlugin`](#name-the-origin-and-the-flow-of-a-trace-traceplugin) | `traceId` and `traceGroupId` for a trace: the root of an emitter, a flow, a named listener. | `nanoeffects/trace` | The same bus |
| [`reactPlugin`](#tell-the-bus-when-a-react-value-changes-reactplugin) | A React hook that emits when a value of a component changes. | `nanoeffects/react` | The same bus, with `useEmitter` |
| [`devPlugin`](#find-leaks-while-you-develop-devplugin) | Warnings about listeners that pile up, and messages about modules, while you develop. | `nanoeffects/dev` | A function that disconnects it |

### Give one action its own fields: `scopePlugin`

An action with a handler, an action, a job or a module can carry its own fields and effects, and one `emit` can replace them. A test gives a fake to one call. More in [Scopes](scope.md).

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { scopePlugin } from "nanoeffects/scope";

// scopePlugin — makes the scope of a command work on this bus
const bus = createBus().use(scopePlugin());

// the last argument: fields of this command only
const getUser = createAction("user/get", (id, { api }) => api.getUser(id), {
  api,
});

const fakeApi = { getUser: async (id) => ({ id, name: "test" }) };
bus.emit(getUser("1"), { api: fakeApi }); // a fake api for this call only
```

### Tie an emit to an outside signal: `signalPlugin`

A library such as React Query owns the request and gives you an `AbortSignal`. `emit` takes it as `{ signal }` and aborts the tasks it starts when the signal aborts, so `timeout`, `retry` and the request stop too. More in [Use nanoeffects with React Query and SWR](query-libraries.md).

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { signalPlugin } from "nanoeffects/signal";

// signalPlugin — emit takes { signal } for a command, a job or an action
const bus = createBus().use(signalPlugin());

const getUser = createAction("user/get", (id, { signal }) => api.getUser(id, { signal }));

const controller = new AbortController();
bus.emit(getUser("1"), { signal: controller.signal }); // runs the command
controller.abort(); // ctx.signal of the handler aborts with it
```

### Name the origin and the flow of a trace: `tracePlugin`

With a tracer on the bus, the plugin lets a trace say which subscription began a chain (`traceId` of `useEmitter` and `bus.emitter`), follow one flow by a `traceGroupId`, and show which listener ran (`bus.on(event, handler, { traceId })`). Without the plugin the options are ignored. More in [Tracing](tracing.md#show-which-subscription-began-a-chain).

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: sends each trace event to the logger; consoleLogger: prints one line each
const trace = createTracer(consoleLogger());

// tracePlugin — names the roots, groups and listeners of the trace
const bus = createBus({ trace })
  .use(tracePlugin());

bus.on("name/changed", saveName, { traceId: "saveNotifier" }); // a listener you can find in the log
```

### Listen to a group of events: `matchPlugin`

`on`, `once` and `off` take a function that picks the events, such as every `user/*` event. A type guard narrows the payload. The subscription listens to every event, so for a few known events `on(creator, handler)` is cheaper. More in the [Guide](guide.md#pick-events-with-a-function).

```js
import { createBus } from "nanoeffects";
import { matchPlugin } from "nanoeffects/match";

// matchPlugin — on takes a function that picks the events
const bus = createBus().use(matchPlugin());

bus.on(
  (action) => action.type.startsWith("user/"),
  (payload, ctx) => console.log(ctx.type, payload),
);
```

### Hand the bus to a state manager: `emitterPlugin`

`bus.emitter(creator)` is a callback that emits an action. A state manager takes it as its subscription callback, so a change of the store becomes an event. More in [Stores](stores.md#emit-from-a-state-manager).

```js
import { atom } from "nanostores";
import { createBus } from "nanoeffects";
import { createAction, emitterPlugin } from "nanoeffects/actions";

// emitterPlugin — adds bus.emitter
const bus = createBus().use(emitterPlugin());
const nameChanged = createAction("name/changed");
const $name = atom("");

$name.listen(bus.emitter(nameChanged)); // every change of $name emits nameChanged
```

### Tell the bus when a React value changes: `reactPlugin`

`useEmitter(event, value, options?)` emits after a render commits with a new value. It does not emit on mount, and not twice under StrictMode. The options are `{ equals, traceId, traceGroupId }`; the last two name the emit in the [trace](tracing.md#show-which-subscription-began-a-chain). It needs React 18 or newer. More in [Stores](stores.md#react-sharing-a-value-across-components).

```jsx
import { useState } from "react";
import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

// reactPlugin — adds bus.useEmitter; destructuring gives a free hook
const bus = createBus().use(reactPlugin());
const { useEmitter } = bus;

function Profile() {
  const [name, setName] = useState("");
  useEmitter("name/changed", name); // emits after a render with a new name
  return <input value={name} onChange={(event) => setName(event.target.value)} />;
}
```

### Find leaks while you develop: `devPlugin`

It warns about listeners that were added and never unbound, and reports the modules that are mounted, replaced and unmounted. In a production build `nanoeffects/dev` is empty, so the call can stay. More in [Hot reload](hmr.md#report-leaks-with-devplugin).

```js
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { devPlugin } from "nanoeffects/dev";

const bus = createBus();
bus.use(modulePlugin([userModule]));

// devPlugin — warnings and messages in the console while you develop;
// it finds the app of modulePlugin on the bus, whichever you use first
const disconnect = bus.use(devPlugin());

disconnect(); // stops the diagnostics
```

## Put them together

One bus with every plugin that does not need React, in a file of its own. The events of the app stay in other files. The plugins work in any order; the next section says what that means for modules.

```js
// bus.js
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";
import {
  actionsPlugin,
  emitterPlugin,
  modulePlugin,
} from "nanoeffects/actions";
import { devPlugin } from "nanoeffects/dev";
import { all, effectsPlugin, race } from "nanoeffects/effects";
import { matchPlugin } from "nanoeffects/match";
import { scopePlugin } from "nanoeffects/scope";

export const bus = createBus()
  .use(contextPlugin({ store })) // ctx.store on every task
  .use(effectsPlugin({ race, all })) // ctx.race and ctx.all, bound to the task
  .use(scopePlugin()) // scopes for commands, actions, jobs, modules and emit
  .use(matchPlugin()) // bus.on takes a function that picks the events
  .use(emitterPlugin()); // bus.emitter(creator)

// actionsPlugin — the registry of action handlers; keep it to bind handlers later
export const actions = bus.use(actionsPlugin());

// modulePlugin — mounts userModule at the end of this block; keep app to mount and unmount later
export const app = bus.use(modulePlugin([userModule]));

// devPlugin — reports leaks and modules while you develop; keep disconnect to remove it
export const disconnect = bus.use(devPlugin());
```

## Use them in any order

The plugins give the same result in any order. Use them as they read best, and put the app of `modulePlugin` where you keep it.

Two things happen because modules are mounted late:

- **Modules start at the end of the block.** `modulePlugin([userModule])` mounts `userModule` when the synchronous block that made it has finished, or earlier if the app or the bus is used first: the first `bus.emit`, or the first call of `app.mount`, `app.unmount`, `app.isMounted`, `app.dispose` or the read of `app.actions`. By then every plugin used in the same block is on the bus, so a module and the tasks it spawns have the fields, effects and scopes of the plugins you used after `modulePlugin`, and `m.on(fn, handler)` works with `matchPlugin`. A plugin used after an `await` can come too late: use every plugin before the first `await`. With no module, `modulePlugin()` starts nothing until the first use.
- **Listeners keep their place.** A `bus.on` after `bus.use(modulePlugin(...))` is held until the modules are mounted, then made, in the order you wrote them. The listeners of a module therefore stay ahead of the ones registered after the plugin, and behind the ones registered before it. The function `bus.on` returns works before and after.

Other plugins do not need an order for another reason:

- `actionsPlugin` binds its list in the registry that the bus has, so it can come before or after `modulePlugin`. A custom `bus.actions = { run }` is replaced.
- `effectsPlugin` and `contextPlugin` do not replace a field that is on `ctx` already, so a scope wins in any order.
- `devPlugin()` finds the app that `modulePlugin` put on the bus (`bus.app`). `devPlugin({ app })` still works.
- `matchPlugin` and `devPlugin` both wrap `bus.on`; `devPlugin` counts a function that picks events under `"*"`, and its `disconnect` leaves a wrapper that was put on top of it.

A name that is already a context field of the bus is a type error when `contextPlugin` or `effectsPlugin` adds it again.

A test puts every plugin on a bus in many orders and checks what each one does (`src/tests/plugin-matrix.test.ts`). An order that breaks something is a bug.

## See what is not a plugin

These connect the bus to something, but are not used with `bus.use`:

- `createEffectsMiddleware(bus, { filter })` from `nanoeffects/redux` is a Redux middleware for a bus that exists. See [Stores](stores.md#wire-redux-toolkit-to-a-bus).
- `createBus({ trace })` takes a tracer from `nanoeffects/trace`. See [Tracing](tracing.md).
- `extendBus(bus, Base)` from `nanoeffects/oop` gives a class the methods of a bus, with the subscriptions of each instance ended by `dispose()`. It reads the bus as it is, so use the plugins first. See [Use the bus from a class](oop.md).
- `createObserve(bus)` from `nanoeffects/observable` turns an event into an Observable. See [Observable](observable.md).

## Write your own plugin

A plugin is a function of the bus that returns what you want back. The bus keeps no list of plugins, so a plugin that was used cannot be taken out by the bus; it returns its own `stop` or `disconnect` when it needs one.

```js
// count-plugin.js
// your own plugin: a function of the bus that returns what you want back
export const countPlugin = (bus) => {
  let count = 0;
  const unbind = bus.on("*", () => {
    count += 1;
  });
  return { count: () => count, stop: unbind };
};
```

```js
import { createBus } from "nanoeffects";
import { countPlugin } from "./count-plugin";

const bus = createBus();
// use — calls countPlugin(bus) and returns its result
const counter = bus.use(countPlugin);

bus.emit("greet", "Ada");
console.log(counter.count()); // 1
counter.stop();
```
