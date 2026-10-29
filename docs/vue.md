# Use nanoeffects in a Vue app

Use this page when your app is in Vue 3 and a component has to talk to the bus: tell it that a value changed, and show the result of an event. `vuePlugin` gives you two functions for that. To see them in a running project, start from the `vue-ts` template in [Start a project from a template](starter.md#start-with-vue).

You need Vue 3.3 or newer and `nanoeffects` installed. If you do not know what the bus is, read the [Guide](guide.md) first.

## Add the plugin to the bus

**Problem.** Without help, a component writes `watch(query, (value) => bus.emit(queryChanged(value)))` and its own subscription in `onMounted` and `onUnmounted`. The same few lines are copied into every component, and each copy forgets something: the cleanup, the equality check, or the name of the subscription in the trace.

**When.** A Vue component sends values to the bus, reads events from it, or both.

`vuePlugin()` adds two functions to the bus. Take them out of the bus once, in the file that makes it, and import them where you need them:

```js
// bus.js
import { createBus } from "nanoeffects";
import { vuePlugin } from "nanoeffects/vue";

// createBus — the event bus, created once outside Vue
// vuePlugin — adds watchEmitter and useEventRef to the bus
export const bus = createBus().use(vuePlugin());
export const { watchEmitter, useEventRef } = bus; // free functions: they do not read `this`
```

## Tell the bus that a value changed

<!-- docs-check: continue -->

`watchEmitter(source, event)` watches a `ref` or a getter and emits `event` with the new value after it changes. It does not emit when it is called, and it stops when the component unmounts. It is `watch` that ends with an emit, so it follows the rules of `watch`: several changes in one tick emit once, with the last value, and a `ref` that holds an object that you change in place does not trigger it.

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — an event with a name; calling it builds { type, payload }
export const queryChanged = createAction("search/queryChanged");
export const searchLoaded = createAction("search/loaded");
```

```js
// query-box.js
import { ref } from "vue";
import { watchEmitter } from "./bus";
import { queryChanged } from "./search";

export const setup = () => {
  const query = ref("");

  // watchEmitter — emits queryChanged(query) when query changes, never on mount
  watchEmitter(query, queryChanged);

  return { query };
};
```

The third argument takes the options `equals`, `traceId` and `traceGroupId`:

| Option | Use it when |
| ------ | ----------- |
| `equals(previous, next)` | A new object with the same fields should not emit: `{ equals: (a, b) => a.id === b.id }`. |
| `traceId` | You want the subscription to have a name in the [trace](tracing.md#show-which-subscription-began-a-chain). |
| `traceGroupId` | You want to name the whole flow that the emit starts. |

`watchEmitter` returns the function that stops it early, for use outside a component.

## Show the result of an event

<!-- docs-check: continue -->

`useEventRef(event, initial)` returns a `ref` that starts as `initial`, and that every `event` of the bus sets to its payload. It stops listening when the component unmounts. A payload that is a function is stored, not called.

```js
// found-list.js
import { useEventRef } from "./bus";
import { searchLoaded } from "./search";

export const setup = () => {
  // useEventRef — like ref([]), but searchLoaded sets the value
  const found = useEventRef(searchLoaded, []);

  return { found };
};
```

In TypeScript the type of the `ref` comes from the event: with `createAction<string[]>("search/loaded")` it is `Ref<string[]>`, and for an event with no payload type it comes from `initial`.

### It is not a store

`useEventRef` is state of one component. Each component that calls it keeps its own copy of the last payload, and the bus keeps no values, so an event that came before the call is lost. To share a value between components, or to keep it for components that mount later, keep it in a store such as Pinia and write to it from a handler of the event. Or call `useEventRef` once in a component at the root and pass the `ref` down with `provide` and `inject`.

## Where to go next

- The same two jobs for React: [Build a sign-up form in React](react.md).
- A policy in a component (a debounced save): in `<script setup>` make it once with [`withPolicy`](policies.md#use-a-policy-without-a-bus); Vue runs the setup once, so it needs no hook.
- Keep values in Pinia: [Connect Redux, Zustand, MobX, or Pinia](stores.md).
