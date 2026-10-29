# Use the bus from a class

Use this page when **your domain logic lives in classes**: a service, a store or a controller that needs the bus inside its methods. A class made with `extendBus` has `on`, `emit` and the other methods of the bus, and remembers what each instance subscribed to, so `dispose()` ends it all.

If your logic is plain functions, stay with [modules](actions.md#mount-domains-with-modules): a module is the same idea without a class.

## The problem without it

A class that listens to the bus keeps a reference to it, and keeps every unsubscribe function in a list to call when the object goes away. Forget one and the old object keeps handling events. `extendBus` does both for you.

## Give a class the methods of a bus

`extendBus(bus, Base)` returns a subclass of `Base`. Its instances have the methods of the bus, and the arguments of `new` go to the constructor of `Base`.

```js
// bus.js
import { createBus } from "nanoeffects";

// createBus — the bus that the services of the app share
export const bus = createBus();
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — the events of the search domain
export const queryChanged = createAction("search/query-changed");
export const resultsLoaded = createAction("search/results-loaded");
```

```js
// search-service.js
import { extendBus } from "nanoeffects/oop";
import { bus } from "./bus";
import { queryChanged, resultsLoaded } from "./search";

class SearchServiceBase {
  constructor(api) {
    this.api = api;
    // this.on — a subscription of this instance; dispose() removes it
    this.on(queryChanged, (query, ctx) => this.search(query, ctx)); // an arrow keeps this
  }

  async search(query, { signal, emit }) {
    const items = await this.api.search(query, { signal });
    emit(resultsLoaded(items));
  }
}

// extendBus — a subclass whose instances have on, once, off, emit and dispose
export const SearchService = extendBus(bus, SearchServiceBase);
```

```js
import { queryChanged } from "./search";
import { SearchService } from "./search-service";

const service = new SearchService(api); // the arguments go to SearchServiceBase
service.emit(queryChanged("nano")); // the same bus as bus.emit
service.dispose(); // its subscriptions are gone
```

What you get:

- The class keeps the name of `Base`, and its instances are instances of `Base`.
- `on`, `once`, `off` and `emit` act on the bus. They can be destructured: `const { emit } = service`.
- The other methods of the bus, such as `emitter` from [`emitterPlugin`](plugins.md), are there too. Only the plugins used **before** `extendBus` count: the names are taken when it runs.
- `bus` is the bus, and `Class.bus` is the same one.
- `this.on` works in the constructor of `Base`. The methods exist on the prototype of the subclass, which is the prototype of the instance already.

## Let the class make its bus

Leave the bus out and the class gets its own, shared by all of its instances.

```js
// notifier.js
import { extendBus } from "nanoeffects/oop";

class NotifierBase {}

// extendBus without a bus — a new bus for this class; two classes have two buses
export const Notifier = extendBus(NotifierBase);

const first = new Notifier();
const second = new Notifier();
second.on("notified", (message) => console.log(message));
first.emit("notified", "hello"); // the instances share Notifier.bus
```

Pass a bus when you need plugins (`contextPlugin`, `scopePlugin`) or when several classes talk to each other.

## End the subscriptions with `dispose`

`dispose()` removes every subscription made through `this.on` and `this.once` of that instance, and nothing else. It is safe to call twice. `instance[Symbol.dispose]()` does the same, so `using service = new SearchService(api)` works where the runtime supports it.

```js
// dispose.js
import { createBus } from "nanoeffects";
import { extendBus } from "nanoeffects/oop";

const bus = createBus();
const Service = extendBus(bus, class {});

const service = new Service();
const stop = service.on("ping", () => console.log("service heard it"));
bus.on("ping", () => console.log("the bus heard it")); // not a subscription of the service

service.dispose();
bus.emit("ping"); // only "the bus heard it"
stop(); // the function on returned still works, and does nothing now
```

A subscription that you removed yourself (the function `on` returned, `this.off`, or a `once` that fired) is forgotten, so the instance holds nothing for it.

## Keep a method of your own

The class wins any clash of names. If `Base` has `emit`, `dispose`, `on` or `bus`, yours stays and the bus method is not added. A `Base` with its own `dispose` would never end the subscriptions, so call `disposeBus(this)` from there.

```js
// cache.js
import { createBus } from "nanoeffects";
import { disposeBus, extendBus } from "nanoeffects/oop";

const bus = createBus();

class CacheBase {
  dispose() {
    this.items.clear(); // your own cleanup
    disposeBus(this); // disposeBus — ends the subscriptions of this instance
  }

  items = new Map();
}

export const Cache = extendBus(bus, CacheBase);
```

`disposeBus` does nothing for a value that is not an instance of such a class.

## Subscribe a method with `@On` and `@Once`

A decorator turns a method into a handler of an event for each instance, with `this` bound. You write no `this.on` in the constructor, and `dispose()` ends the subscription too.

The bus and the events are the same as above, in TypeScript:

```ts
// bus.ts
import { createBus } from "nanoeffects";

export const bus = createBus();
```

```ts
// search.ts
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction<string>("search/query-changed");
export const resultsLoaded = createAction<string[]>("search/results-loaded");
```

```ts
// search-service.ts
import { latest } from "nanoeffects/policies";
import { extendBus, On, Once } from "nanoeffects/oop";
import { bus } from "./bus";
import { queryChanged, resultsLoaded } from "./search";

class SearchServiceBase {
  // On — this method handles queryChanged for each instance, this is the instance;
  // latest — each new query aborts the one before it
  @On(queryChanged, latest)
  async search(query: string, { signal, emit }: { signal: AbortSignal; emit: (event: unknown) => void }) {
    const items = await api.search(query, { signal });
    emit(resultsLoaded(items));
  }

  // Once — runs for the first event only
  @Once("search/ready")
  ready() {
    console.log("first ready");
  }
}

export const SearchService = extendBus(bus, SearchServiceBase);
```

Things to know:

- The event is a name, an action creator or a command, as for `bus.on`. For a creator or a command the payload of the method is checked against it.
- The second argument, `wrap`, takes the bound handler and returns the one to subscribe: `latest`, or `(handler) => debounce(300, handler)`. A policy needs it: `latest(this.search)` wraps the function without `this`, and the bound handler is what `wrap` gets.
- The subscriptions are made right after the constructor of `Base`. An event that is emitted inside that constructor does not reach them.
- A subclass inherits them. A method that a subclass overrides is subscribed only if the override is decorated.
- On a class that `extendBus` did not make, a decorator does nothing.
- Both the decorators of the language and `experimentalDecorators` work. Your compiler has to support the one you use: TypeScript 5 or newer for the first, and the `experimentalDecorators` option for the second.

Name a method for the [trace](tracing.md#name-a-listener) with `{ traceId }`, as the second argument or, after a wrapper, the third: `@On(queryChanged, { traceId: "searcher" })` or `@On(queryChanged, latest, { traceId: "searcher" })`. It needs `tracePlugin` on the bus and is ignored without it.

## Decorate the class with `@WithBus`

`@WithBus(bus)` does what `extendBus(bus, Base)` does, as a class decorator. `@WithBus()` makes a bus for the class.

<!-- docs-check: continue -->

```ts
// search-service.ts
import { type BusMethods, On, WithBus } from "nanoeffects/oop";
import { bus } from "./bus";
import { queryChanged } from "./search";

// TypeScript does not change the type of a decorated class, so say what it gets;
// checker only: at run time WithBus already adds the methods
interface SearchService extends BusMethods<typeof bus> {}

// WithBus — replaces the class by extendBus(bus, SearchService)
@WithBus(bus)
class SearchService {
  @On(queryChanged)
  search(query: string) {
    console.log(query);
  }
}

export { SearchService };
```

Prefer `extendBus(bus, Base)` when you can: its types come from the call and need no `interface`.

## Pass a method by hand

A handler given to `this.on` is called as the bus calls it, with no `this`. A method passed bare loses `this`, as in plain JavaScript:

```js
// handlers.js
import { createBus } from "nanoeffects";
import { extendBus } from "nanoeffects/oop";

class BaseWithHandler {
  name = "handler";

  handle() {
    console.log(this?.name);
  }

  listen() {
    this.on("ping", this.handle); // this is lost: prints undefined
    this.on("ping", () => this.handle()); // an arrow keeps it
  }
}

export const Listener = extendBus(createBus(), BaseWithHandler);
```

Use an arrow or a decorated method. The library does not bind `this` for you: a policy such as `latest(this.handle)` wraps the function, so binding would work in half of the cases.

## Type the instances (optional)

`extendBus` returns a class that takes the arguments of `Base`, and its instances are `Base` plus `BusMethods<typeof bus>`: the function members of the bus (`on`, `emit`, and those of plugins used before) with `dispose` and `bus`. A member of `Base` with the same name keeps its own type.

```ts
// service.ts
import { createBus } from "nanoeffects";
import { extendBus } from "nanoeffects/oop";

type Events = { "order/placed": { id: string } };

// Events — checker only: the payloads of the bus
const bus = createBus<Events>();

class OrderServiceBase {
  name: string;

  constructor(name: string) {
    this.name = name;
  }
}

export const OrderService = extendBus(bus, OrderServiceBase);

const service = new OrderService("main"); // the constructor of OrderServiceBase
service.emit("order/placed", { id: "o1" }); // checked against Events
```

## What is not done

- `this` is not bound in a handler that you pass by hand (see above).
- The methods of a plugin used after `extendBus` are not on the class. Use the plugins first, then `extendBus`.
- One bus for each instance, mixing the methods into an object that exists, and decorators for fields or parameters are not part of this entry.
