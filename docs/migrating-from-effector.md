# Coming from Effector

Read this page if your project uses Effector and you want to know where nanoeffects fits. They overlap in one place: events that start effects. Effector also holds state; nanoeffects does not. It maps the names, shows one effect both ways, and lists what has no equivalent.

## Split the work

| Job | Use |
| --- | --- |
| Hold state (`createStore`, `combine`, `restore`) | Effector, or any store: [Stores](stores.md) |
| Derive state from events (`.on`, `sample` into a store) | Effector, or any store |
| Run a request when an event happens, cancel, retry, time out, trace | nanoeffects |

nanoeffects has no store. `createStore` can be replaced by any store you like, for example Zustand: a store and its `set` do the job of `createStore` and `.on`. [Stores](stores.md) shows how each of Zustand, Redux, MobX, Jotai and others calls the bus. If you keep Effector, use nanoeffects only for the effects that `createEffect` runs with little control over overlapping calls.

## Find the equivalent

| Effector | nanoeffects |
| -------- | ----------- |
| `createEvent()` | an event name on the bus, or [`createAction`](actions.md) |
| event call `loaded(user)` | `bus.emit("loaded", user)` |
| `createEffect(handler)` | a handler: `bus.on(event, handler)` |
| effect with `done` and `fail` | [`createJob`](actions.md): emits the success and fail actions |
| `effect.pending` | `job.pending`, `job.success`, `job.fail` and `job.cancel`: set and clear the flag in your store ([Show a loading state](actions.md#show-a-loading-state-with-a-job)) |
| `sample({ clock, fn, target })` | `bus.on(clock, handler)` and `ctx.emit(target, …)` |
| `sample({ source: $store, clock })` | read the store from a [context field](context.md) in the handler |
| `sample({ filter })` | an `if` in the handler |
| `debounce`, `throttle` from patronum | [`debounce`, `throttle`](policies.md) (same rules as lodash, checked in tests) |
| take only the last effect call | [`latest`](policies.md) |
| `attach` | a [context field](context.md): the handler reads it from `ctx` |
| `fork()` and scope | one `createBus()` per scope |
| `createStore`, `combine`, `restore` | any store, such as Zustand, Redux, MobX or Jotai: see [Stores](stores.md) |
| `watch`, `createWatch` | `bus.on(event, handler)` |
| `event.prepend(fn)` | a function that you write, `(event) => ({ key, value })`; the bus needs nothing |
| `useStoreMap({ store, keys, fn })` | a selector of your store; with `useState` the component keeps the value |
| `event.watch((e) => e.preventDefault())` | call `event.preventDefault()` in the `onSubmit` handler |

## Rewrite an effect

A search that runs on every query, and reacts to the result:

<!-- docs-check: skip - needs effector, which the project does not depend on -->
```js
// Effector
import { createEffect, createEvent, createStore, sample } from "effector";

const queryChanged = createEvent();
const searchFx = createEffect((query) => api.search(query));
const $items = createStore([]).on(searchFx.doneData, (_, items) => items);

sample({ clock: queryChanged, target: searchFx });
```

If the user types fast, several `searchFx` calls overlap, and the old ones are not cancelled. The same job in nanoeffects, with the old request cancelled:

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

// latest: a newer query aborts the request in flight
const search = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  bus.emit("found", items);
});

bus.on("query-changed", debounce(300, search)); // debounce: run after 300 ms of quiet
```

The store (`$items`) is not here. Keep it in Effector and update it from the `found` event, or replace it with a store of your choice. The next example does that with Zustand.

### Keep the state in Zustand

Without Effector, something must hold `$items`. A Zustand store does it: `create` replaces `createStore`, and `setState` replaces `.on(searchFx.doneData, …)`. The handler writes the result to the store directly, so the `found` event is not needed. A component reads the store with a selector, as `useUnit($items)` did.

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // the bus: only the bus
```

```js
// search-store.js
import { create } from "zustand";

// create — Zustand: the store replaces $items
export const useSearchStore = create(() => ({ items: [] }));
```

```js
// search-handlers.js
import { debounce, latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { useSearchStore } from "./search-store";

// latest — a newer query aborts the request in flight; debounce — wait 300 ms of quiet
const search = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  useSearchStore.setState({ items }); // Zustand: replaces .on(searchFx.doneData, …)
});

bus.on("query-changed", debounce(300, search));
```

```jsx
// Search.jsx
import { bus } from "./bus";
import { useSearchStore } from "./search-store";

export function Search() {
  const items = useSearchStore((state) => state.items); // Zustand: a selector reads items

  return (
    <div>
      <input onChange={(event) => bus.emit("query-changed", event.target.value)} />
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

`bus.emit("query-changed", …)` in `onChange` does the work of calling the `queryChanged` event. To also start a task when the store changes, see [Zustand in Stores](stores.md#zustand).

## Rewrite a form

The form from the [Forms recipe of the Effector docs](https://effector.dev/en/recipes/react/forms/) has five parts: an event for a change of a field (`fieldUpdate`), a store for the values (`$form`), an event for the submit (`formSubmitted`), an effect that sends them (`sendFormFx`), and a `sample` that reads the store when the form is submitted. Four of them keep state or wire units together. Only the effect has a counterpart in nanoeffects.

<!-- docs-check: skip - needs effector, which the project does not depend on -->
```jsx
// Effector (adapted from the Effector docs)
import { createEffect, createEvent, createStore, sample } from "effector";
import { useStoreMap } from "effector-react";

const formSubmitted = createEvent();
const fieldUpdate = createEvent();

const sendFormFx = createEffect((params) => {
  console.log(params);
});

const $form = createStore({});
$form.on(fieldUpdate, (form, { key, value }) => ({ ...form, [key]: value }));

// sample: when the form is submitted, read $form and run the effect with it
sample({ clock: formSubmitted, source: $form, target: sendFormFx });

// prepend: turn a DOM event into the { key, value } that fieldUpdate takes
const handleChange = fieldUpdate.prepend((event) => ({
  key: event.target.name,
  value: event.target.value,
}));

const Field = ({ name, type, label }) => {
  const value = useStoreMap({
    store: $form,
    keys: [name],
    fn: (values) => values[name] ?? "",
  });

  return (
    <div>
      {label} <input name={name} type={type} value={value} onChange={handleChange} />
    </div>
  );
};

const App = () => (
  <form onSubmit={formSubmitted}>
    <Field name="login" label="Login" />
    <Field name="password" type="password" label="Password" />
    <button type="submit">Submit!</button>
  </form>
);

formSubmitted.watch((event) => {
  event.preventDefault();
});
```

The same form with nanoeffects. The values live in React state: nanoeffects holds none, and any store of [Stores](stores.md) works the same way. The effect becomes a handler of the submit event. The values travel in the event, so no `sample` and no `source` are needed. First the bus and the handler, each in its own file:

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // the bus: only the bus
```

```js
// form-handlers.js
import { bus } from "./bus";

// bus.on — the job of sendFormFx: runs when the form is submitted
bus.on("form/submitted", (values) => {
  console.log(values);
});
```

Then the form. `useState` does the work of `$form`, `fieldUpdate` and `prepend`; the event handler does the work of the `watch` that called `preventDefault`:

```jsx
// App.jsx
import { useState } from "react";
import { bus } from "./bus"; // the bus of the previous snippet
import "./form-handlers"; // registers the handler; the app does this once, when it starts

function Field({ name, type, label, value, onChange }) {
  return (
    <div>
      {label} <input name={name} type={type} value={value} onChange={onChange} />
    </div>
  );
}

export function App() {
  const [form, setForm] = useState({}); // the values of the form, as $form held them

  // one handler for every field, as handleChange was
  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault(); // the page must not reload; no separate watcher is needed
    bus.emit("form/submitted", form); // bus.emit — the values go in the event
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field name="login" label="Login" value={form.login ?? ""} onChange={handleChange} />
      <Field
        name="password"
        type="password"
        label="Password"
        value={form.password ?? ""}
        onChange={handleChange}
      />
      <button type="submit">Submit!</button>
    </form>
  );
}
```

`useStoreMap` re-renders only the field whose value changed. Here every field re-renders with the form, which is fine for a small form. If it matters, use the selector of your store (Zustand and Jotai have one).

If the values live in a store outside React, give the store to the handlers with `createBus({ context: { store } })` ([Context fields](context.md)) and read it in the handler, as `sample` read `$form`.

### Replace the log with a request

`sendFormFx` only logs. A real sign-up sends a request, and then the double click and the network matter. `leading` drops a second submit while the first one runs, and `ctx.signal` lets the request be cancelled:

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and their handlers

// leading — a second submit is ignored while the request is running
bus.on(
  "form/submitted",
  leading(async (values, ctx) => {
    // api — your client; ctx.signal lets the request be cancelled
    await api.signUp(values, { signal: ctx.signal });
  }),
);
```

Retrying a failed network request, and cancelling when the form closes, are in [Build a sign-up form in React](react.md).

## Use both in one app

Keep the Effector stores, and run the effects on the bus. A store calls the bus through `bus.emitter`, and the handler sends the result back as an event that the store listens to.

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";

export const bus = createBus().use(emitterPlugin()); // adds bus.emitter
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed"); // a plain action creator
```

<!-- docs-check: skip - needs effector, which the project does not depend on -->
```js
import { createEvent, createStore } from "effector";
import { latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { queryChanged } from "./search";

const found = createEvent(); // Effector: the result comes back as an event
const $items = createStore([]).on(found, (_, items) => items);
const $query = createStore("");

// watch calls back on every change of the store; bus.emitter turns it into an emit
$query.watch(bus.emitter(queryChanged));

bus.on(
  queryChanged,
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal });
    found(items); // back to Effector
  }),
);
```

## What is different

- **No state.** There is no `createStore`, `combine`, `restore`, `$store.map`. The bus holds listeners only. Take a store such as Zustand for state ([Stores](stores.md)).
- **`pending` is an action, not a store.** `createJob` sends `pending` when the handler starts, and `success`, `fail` or `cancel` when it ends; you keep the flag in your store ([Show a loading state](actions.md#show-a-loading-state-with-a-job)). Policies report to the job, so the flag also follows `latest`, `leading`, `debounce`, `throttle` and `queue`; that section says when to count instead. A running task is also visible through [Tracing](tracing.md).
- **Cancellation is the default tool.** An Effector effect runs every call to the end. Here `latest` and `ctx.signal` stop what is no longer needed.
- **Events are matched by name, not by identity.** An event is a string or a `createAction` creator, not a unit that you import and call. Two modules agree on the name.
- **No graph.** `sample` and `forward` build a static graph. A bus subscribes handlers at runtime and the call order is the order of `on`.
- **The event carries the data.** `sample({ source })` reads a store at the moment of the clock. Here the sender puts the values in the event (`bus.emit("form/submitted", form)`), or the handler reads a store from a [context field](context.md).
- **Scopes are buses.** `fork()` becomes a `createBus()` per scope (a test, a request on the server).
