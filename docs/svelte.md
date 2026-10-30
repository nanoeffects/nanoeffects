# Use nanoeffects in a Svelte app

Use this page when your app is in Svelte 5 and a component has to show the result of an event. `sveltePlugin` gives you one function for that, `eventStore`. To see it in a running project, start from the `svelte-ts` template in [Start a project from a template](starter.md#start-with-svelte).

You need Svelte 5 or newer and `nanoeffects` installed. If you do not know what the bus is, read the [Guide](guide.md) first.

## Add the plugin to the bus

**Problem.** A Svelte component reads a value with `$store`. An event of the bus is not a store, so without help the component writes its own `readable` and its own `bus.on`, and has to remember to stop listening. The same few lines are copied into every component.

**When.** A component shows the payload of an event, such as the result of a search.

`sveltePlugin()` adds `eventStore` to the bus. Take it out of the bus once, in the file that makes it, and import it where you need it:

```js
// bus.js
import { createBus } from "nanoeffects";
import { sveltePlugin } from "nanoeffects/svelte";

// createBus — the event bus, created once outside Svelte
// sveltePlugin — adds eventStore to the bus
export const bus = createBus().use(sveltePlugin());
export const { eventStore } = bus; // a free function: it does not read `this`
```

## Show the result of an event

<!-- docs-check: continue -->

`eventStore(event, initial)` returns a Svelte store. Its value is `initial` at first and the payload of every `event` after that. In a component, `$found` reads it, and Svelte subscribes and unsubscribes for you. A payload that is a function is stored, not called.

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — an event with a name; calling it builds { type, payload }
export const searchLoaded = createAction("search/loaded");
```

<!-- docs-check: skip - a .svelte file -->
```svelte
<script>
  import { eventStore } from "./bus";
  import { searchLoaded } from "./search";

  // eventStore — like a store of [], but searchLoaded sets the value
  const found = eventStore(searchLoaded, []);
</script>

<ul>
  {#each $found as title (title)}
    <li>{title}</li>
  {/each}
</ul>
```

In TypeScript the type of the store comes from the event: with `createAction<string[]>("search/loaded")` it is `Readable<string[]>`, and for an event with no payload type it comes from `initial`.

To send a value to the bus, call `bus.emit` from the handler of the event, for example `oninput`. Nothing is emitted when the component mounts, so no plugin function is needed for that direction.

### It is not a store of the app

The bus listens only while something reads the store: the first `$found` starts it, and the last one stops it. The bus keeps no values, so an event that came while nothing read the store is lost, and a component that mounts later starts from `initial`. To keep a value for components that come later, keep it in a store of your own and write to it from a handler of the event:

```js
// found-store.js
import { writable } from "svelte/store";
import { bus } from "./bus";
import { searchLoaded } from "./search";

// writable — a Svelte store that you keep for the whole app
export const foundTitles = writable([]);

// bus.on — copy every searchLoaded into the store, whether or not a component is open
bus.on(searchLoaded, (titles) => foundTitles.set(titles));
```

## Where to go next

- The same job for React: [Build a sign-up form in React](react.md); for Vue: [Use nanoeffects in a Vue app](vue.md).
- A policy in a component (a debounced save): in the script of a component make it once with [`withPolicy`](policies.md#use-a-policy-without-a-bus); Svelte runs the script once, so it needs no hook.
