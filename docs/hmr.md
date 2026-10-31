# Hot reload and development diagnostics

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
- **Options.** `leaks: false` and `modules: false` switch a diagnostic off; `maxListeners` sets the limit; `log` receives the messages instead of the console.
- **Disconnect.** `bus.use(devPlugin(...))` returns the function that stops the diagnostics and puts `bus.on` and `app.mount` back.

It changes no behavior: it wraps `bus.on`, `app.mount`, and `app.unmount` and adds messages.

### Keep the import in production

`nanoeffects/dev` is a no-op in a production build. `package.json` maps it to an empty build under the `production` export condition (Vite and webpack set that in production mode), so `bus.use(devPlugin())` can stay without a guard: it touches nothing and costs a few bytes.

If you want even the call gone, guard it (`if (import.meta.env.DEV)` in Vite). An app that does not import the entry does not carry it.
