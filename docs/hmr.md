# Hot reload and development diagnostics

> **Level F.** Read first: [Actions, jobs and modules](actions.md).

Use this page in development with modules and hot reload. Skip until you mount domains with `modulePlugin`.

When a file is edited, the bundler loads its new version and runs it again, while the page and the rest of the code stay alive. For a bus that can go wrong in three ways:

1. A file that calls `bus.on(...)` subscribes a second time.
2. A file that makes the bus makes a new one.
3. Tasks of the old code keep running.

## Replace modules by name

Mounting a module whose name is taken replaces the mounted one. The old module is unmounted first — and with it its subscriptions, bound handlers, sub-modules, and background tasks (their signals abort). The new version of a module file only has to mount again; nothing piles up.

- **Names must be unique.** The name means “this is the new version of that module”, so two different modules with one name replace each other. The name is also the type of the module’s tasks in the trace.
- **Pass `signal` to what the module does.** An unmount aborts the tasks, but a `fetch` or a loop that ignores `ctx.signal` runs on with the old code.
- **Sub-modules** (`m.use(...)`) are replaced by name inside their parent. A reload of the parent replaces it with all its children.
- Keep the bus and the app in a file that is not reloaded (or in what your bundler keeps across reloads), so a reload does not make a new bus that other files do not talk to.

A `bus.on` outside a module returns the function that unsubscribes: hand it to the dispose hook of your bundler, or put the subscription in a module.

## Report leaks with `devPlugin`

`bus.use(devPlugin())` reports what is easy to miss while developing:

```js
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { devPlugin } from "nanoeffects/dev";

const bus = createBus();
bus.use(modulePlugin([userModule]));
// devPlugin — warn on piled-up listeners; log module mount/replace/unmount
// (it finds the app of modulePlugin on the bus, in either order of the two)
bus.use(devPlugin());
```

- **Listeners that pile up.** When more than `maxListeners` (default `10`) listeners of one event were added and not unsubscribed, one warning names the event and the count. The count follows the function that `on` returns; `bus.off(event, fn)` is not seen.
- **Modules.** For the app of `modulePlugin` (or the `app` option) it logs `module "user" mounted`, `replaced` when a module of the same name was mounted, and `unmounted`. Only what goes through `app.mount` and `app.unmount` is reported, not sub-modules.
- **Where a named listener was made.** For a listener with a `traceId`, it notes the file and the line of the `bus.on` call, while the listener is subscribed. [`graphLogger`](debugging-loops.md#read-a-report) shows it in a loop report, so you can open the handler that closes the loop.
- **Handlers that ignore the signal.** When a handler emits after its task was aborted (a newer call of `latest`, an unmounted module), the bus drops that emit. One warning then names the handler and the event: the handler did not stop when it was cancelled, usually because `ctx.signal` never reached the request. [Details](#find-a-handler-that-ignores-the-signal)
- **Options.** `abandoned: false`, `leaks: false` and `modules: false` switch a diagnostic off; `maxListeners` sets the limit; `log` receives the messages instead of the console.
- **Disconnect.** `bus.use(devPlugin(...))` returns the function that stops the diagnostics and puts `bus.on` and `app.mount` back.

It changes no behavior: it wraps `bus.on`, `app.mount`, and `app.unmount` and adds messages.

### Find a handler that ignores the signal

A policy such as `latest` cancels the older call by aborting its `ctx.signal`. A handler that does not pass the signal to its request keeps running, and its result arrives after the newer one. The policy drops that result, so nothing looks wrong until the handler does something else with it.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

bus.on(
  "search",
  latest(async (query, ctx) => {
    // the signal is not passed, so an older request is not cancelled
    const items = await fetch(`/api?q=${query}`).then((response) => response.json());
    ctx.emit("results", items);
  }),
);
```

With `devPlugin`, the second `search` aborts the first call. When the first call then emits `results`, the bus drops the emit and the plugin warns once:

```text
[nanoeffects] the handler of "search" emitted "results" after its task was aborted, so the emit was dropped. The handler kept running after it was cancelled: pass ctx.signal to the request (fetch(url, { signal: ctx.signal })) or give ctx to an effect (retry(ctx, ...)).
```

The check lives in the plugin only: the policies and the bus carry no code for it, and in production `nanoeffects/dev` is empty. It sees the handlers that emit; a handler that never emits is not seen. For the rest, a linter finds the common case before the code runs: a handler written with no `ctx` parameter. [`examples/lint`](https://github.com/nanoeffects/nanoeffects/tree/main/examples/lint) has a rule for Biome (a GritQL plugin) and one for ESLint (`no-restricted-syntax`, no plugin needed), both checked against a fixture.

```js
// eslint.config.mjs
export default [
  {
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          // a handler of a policy that is a function with fewer than two parameters: no ctx
          selector:
            "CallExpression[callee.name=/^(latest|leading|queue|debounce|throttle)$/] > :matches(ArrowFunctionExpression, FunctionExpression)[params.length<2]",
          message: "This handler has no ctx parameter, so it cannot pass ctx.signal on.",
        },
      ],
    },
  },
];
```

### Keep the import in production

`nanoeffects/dev` is a no-op in a production build. `package.json` maps it to an empty build under the `production` export condition (Vite and webpack set that in production mode), so `bus.use(devPlugin())` can stay without a guard: it touches nothing and costs a few bytes.

If you want even the call gone, guard it (`if (import.meta.env.DEV)` in Vite). An app that does not import the entry does not carry it.
