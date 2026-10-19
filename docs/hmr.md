# Hot reload (HMR)

When a file is edited in development, the bundler loads its new version and runs it again, while the page and the rest of the code stay alive. For a bus that means three things can go wrong:

1. **Handlers pile up.** The file that calls `bus.on(...)` runs again, and the old handlers are still subscribed: every event is handled twice, then three times.
2. **The bus is made again.** A file that has `createBus()` runs again: the new bus has none of the subscriptions of the files that did not reload.
3. **Old work goes on.** Tasks that the old code started keep running with the old logic.

Tasks that are tied to a signal can be ended, and modules are the unit that does it, so the answer is modules.

## Modules are replaced by name

Mounting a module whose name is taken replaces the mounted one: the old module is unmounted first, and with it its subscriptions, its bound commands, its sub-modules and its background tasks (their signals abort). So the new version of a module file only has to mount again.

```ts
// bus.ts: made once, kept across reloads
import { createBus } from "nanoeffects";
import { registerModules } from "nanoeffects/actions";

const hot = import.meta.hot;

export const bus: Bus<Events> = hot?.data.bus ?? createBus<Events>();
export const app: ModuleApi<Events> = hot?.data.app ?? registerModules(bus);
if (hot) {
  hot.data.bus = bus;
  hot.data.app = app;
}
```

On the first run `hot.data` is empty and the bus and the app are made; on a reload the same ones are taken back. The same code is in `examples/hmr.ts`, which is type-checked with the rest of the project.

```ts
// user.module.ts: the module, and nothing else
export const userModule = createModule<Events>("user", (m) => {
  m.handle(getUser, fetchUser);
  m.on("login", latest(loadProfile));
});
```

```ts
// main.ts: mounts the modules, and takes the new version of a module on reload
import { app } from "./bus";
import { userModule } from "./user.module";

app.mount(userModule);

// replaces the old "user" module with the new version
import.meta.hot?.accept("./user.module", (next) => next && app.mount(next.userModule));
```

Vite calls the callback with the new version of `./user.module`, `main.ts` stays alive, and `app.mount` swaps the module. With webpack, `module.hot.accept("./user.module", () => app.mount(require("./user.module").userModule))` does the same.

## What to keep in mind

- **Keep the bus and the app in `import.meta.hot.data`** (or in a file that never reloads), as above. Otherwise a reload of that file makes a new bus, and the modules that did not reload talk to the old one.
- **Names must be unique.** The name is what says "this is the new version of that module", so two different modules with one name replace each other. The name is also the type of the module's tasks in the trace.
- **Pass `signal` to what the module does.** An unmount aborts the tasks, but a `fetch` or a loop that ignores `ctx.signal` runs on. This is the same advice as everywhere else, and in development it also stops old code from writing to the new state.
- **Sub-modules** (`m.use(...)`) are replaced by name inside their parent. A reload of the parent module replaces it with all its children.

## Handlers without modules

A plain `bus.on` returns the function that unsubscribes. Give it to the dispose hook of the file:

```ts
if (import.meta.hot) {
  import.meta.hot.dispose(bus.on("search", latest(runSearch)));
}
```

Several: `import.meta.hot.dispose(() => { off1(); off2(); })`. Handlers inside modules do not need this.

## Redux and stores

With `createEffectsMiddleware`, keep the effects object in `import.meta.hot.data` as well, so the store keeps the same middleware, and register the effects in modules. For a new reducer use `store.replaceReducer(...)` as usual. A store of Zustand or MobX that lives in its own file and is passed in `context` can keep its state across reloads with the means of that library.
