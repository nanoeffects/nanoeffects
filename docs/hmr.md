# Hot reload and development diagnostics

When a file is edited in development, the bundler loads its new version and runs it again, while the page and the rest of the code stay alive. For a bus that can go wrong in three ways: a file that calls `bus.on(...)` subscribes a second time, a file that makes the bus makes a new one, and tasks of the old code keep running.

## Modules are replaced by name

Mounting a module whose name is taken replaces the mounted one. The old module is unmounted first, and with it its subscriptions, its bound commands, its sub-modules and its background tasks, whose signals abort. So the new version of a module file only has to mount again, and nothing piles up.

- **Names must be unique.** The name says "this is the new version of that module", so two different modules with one name replace each other. The name is also the type of the module's tasks in the trace.
- **Pass `signal` to what the module does.** An unmount aborts the tasks, but a `fetch` or a loop that ignores `ctx.signal` runs on with the old code.
- **Sub-modules** (`m.use(...)`) are replaced by name inside their parent. A reload of the parent module replaces it with all its children.
- Keep the bus and the app in a file that is not reloaded, or in what your bundler keeps across reloads, so a reload does not make a new bus that the other files do not talk to.

A `bus.on` outside a module returns the function that unsubscribes: hand it to the dispose hook of your bundler, or put the subscription in a module.

## `nanoeffects/dev`

`bus.use(devPlugin({ app }))` reports what is easy to miss while developing:

```ts
import { devPlugin } from "nanoeffects/dev";

const app = bus.use(modulePlugin([userModule]));
bus.use(devPlugin({ app }));
```

- **Listeners that pile up.** When more than `maxListeners` (default 10) listeners of one event were added and not unsubscribed, one warning names the event and the count: a file that is reloaded and subscribes again, or an unsubscribe that is never called. The count follows the function that `on` returns, and `bus.off(event, fn)` is not seen.
- **Modules.** With `app` it logs `module "user" mounted`, `replaced` when a module of the same name was mounted, and `unmounted`. Only what goes through `app.mount` and `app.unmount` is reported, not sub-modules.
- **Options.** `leaks: false` and `modules: false` switch a diagnostic off, `maxListeners` sets the limit, `log` receives the messages instead of the console.
- **Disconnect.** `bus.use(devPlugin(...))` returns the function that stops the diagnostics and puts `bus.on` and `app.mount` back.

It changes no behavior: it wraps `bus.on`, `app.mount` and `app.unmount` and adds messages.

### In production

`nanoeffects/dev` is a no-op in a production build. `package.json` maps it to an empty build under the `production` export condition, which Vite and webpack set in production mode, so `bus.use(devPlugin({ app }))` can stay without a guard: it touches nothing and costs a few bytes. If you want even the call gone, guard it (`if (import.meta.env.DEV)` in Vite). An app that does not import the entry does not carry it.
