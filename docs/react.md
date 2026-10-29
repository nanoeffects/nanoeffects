# Build a sign-up form in React

Use this page when a React screen starts requests on user input and you need them not to race: a username check while typing, a submit button, a flaky network. It builds one registration form. The bus lives outside React; the component only subscribes to it.

You need a React project and `nanoeffects` installed. The form talks to your own client, `api` below: replace it with your requests.

## See what goes wrong without a bus

A registration form has three problems that `useEffect` and `fetch` leave to you:

- **A stale answer.** The user types `ann`, then `anna`. The answer for `ann` arrives last and says the name is free, although `anna` is taken.
- **A double submit.** A second click on "Sign up" sends a second request while the first one is running.
- **A flaky network.** One failed request should be retried, but a "name is taken" answer should not.

Each has a policy or an effect: `latest`, `leading`, `retry`. They live in one place, outside the component.

## Wire the bus once

Keep the bus in a file of its own, and the handlers of the form in another. Create the bus once, outside any component: a bus created in the body of a component would be a new bus, without subscribers, on every render.

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // the bus: created once, at the top of the module
```

The handlers know the bus and the bus knows nothing of them. They register when `registration.js` is imported, once, when the app starts:

```js
// registration.js
import { retry } from "nanoeffects/effects";
import { debounce, latest, leading } from "nanoeffects/policies";
import { bus } from "./bus";

// fetch rejects with a TypeError when the network fails; an HTTP error is a plain Error
const isNetworkError = (error) => error instanceof TypeError;

// debounce — wait 300 ms of quiet; latest — abort the check of the previous name
bus.on(
  "username/typed",
  debounce(
    300,
    latest(async (name, ctx) => {
      // api — your client; pass ctx.signal so latest can cancel the request itself
      const available = await api.usernameAvailable(name, { signal: ctx.signal });
      ctx.emit("username/checked", { name, available });
    }),
  ),
);

// leading — a second click is ignored while the first sign up is running
bus.on(
  "form/submitted",
  leading(async (form, ctx) => {
    const signUp = () => api.signUp(form, { signal: ctx.signal });
    try {
      // retry — up to 3 tries, 500 ms apart, and only when the network failed
      const user = await retry(ctx, signUp, {
        times: 3,
        delay: 500,
        shouldRetry: isNetworkError,
      });
      ctx.emit("form/succeeded", user);
    } catch (error) {
      ctx.emit("form/failed", error.message);
    }
  }),
);
```

The handlers know nothing about React. A test can emit `username/typed` and read `username/checked` without rendering anything: the same wiring is tested in [`examples/registration-form.ts`](../examples/registration-form.ts) and `src/tests/registration-form.test.ts`.

## Connect the form

<!-- docs-check: continue -->

The component keeps what it shows in `useState`. It subscribes in `useEffect` and emits events from its handlers. `bus.on` returns the function that unsubscribes; returning it from the effect removes the listener on unmount.

```jsx
// SignUpForm.jsx
import { useEffect, useState } from "react";
import { bus } from "./bus"; // the bus of the previous snippet
import "./registration"; // registers the handlers; the app does this once, when it starts

export function SignUpForm() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [available, setAvailable] = useState(null); // null: not checked yet
  const [status, setStatus] = useState("idle"); // idle, sending, done or failed
  const [error, setError] = useState("");

  useEffect(() => {
    // bus.on — listen for what the handlers report; each call returns an unsubscribe function
    const unbindChecked = bus.on("username/checked", (result) => {
      setAvailable(result.available);
    });
    const unbindSucceeded = bus.on("form/succeeded", () => setStatus("done"));
    const unbindFailed = bus.on("form/failed", (message) => {
      setStatus("failed");
      setError(message);
    });

    return () => {
      unbindChecked();
      unbindSucceeded();
      unbindFailed();
    };
  }, []);

  function handleName(event) {
    const value = event.target.value;
    setName(value);
    setAvailable(null);
    bus.emit("username/typed", value); // bus.emit — the handler debounces and checks the name
  }

  function handleSubmit(event) {
    event.preventDefault();
    setStatus("sending");
    bus.emit("form/submitted", { name, password }); // a second click is dropped by leading
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={handleName} placeholder="Username" />
      {available === false && <p>This name is taken</p>}
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button type="submit" disabled={status === "sending"}>Sign up</button>
      {status === "failed" && <p>{error}</p>}
      {status === "done" && <p>Welcome!</p>}
    </form>
  );
}
```

The `disabled` button is only for the look. The form stays correct without it: `leading` drops a second submit while the first one runs.

In development, React StrictMode runs the effect twice (subscribe, unsubscribe, subscribe). That is safe here, because the cleanup removes exactly what the effect added.

## Stop running work when the form closes

<!-- docs-check: continue -->

Unsubscribing stops the component from hearing results, but a request that has started keeps running. To cancel it, the component emits `form/closed` when it unmounts, and each handler that should stop listens for it with `ctx.on`:

```js
import { latest } from "nanoeffects/policies";

// the username check of registration.js, with one new line
const checkName = latest(async (name, ctx) => {
  // ctx.on — a subscription of this task; aborting the task also drops the result
  ctx.on("form/closed", () => ctx.abort());
  const available = await api.usernameAvailable(name, { signal: ctx.signal });
  ctx.emit("username/checked", { name, available });
});
```

In the component, add `bus.emit("form/closed")` to the cleanup function of the effect. This is optional: skip it when finishing a request after unmount does no harm, as for a cheap check.

## Show the last value of an event as state

**Problem.** A component often needs the latest result of an event, such as the found items of a search. The hand-written form is easy to get slightly wrong:

<!-- docs-check: skip - the hand-written form that this section replaces -->
```jsx
useEffect(() => bus.on(searchLoaded, setFound), []);
```

It needs a `useState` next to it, the empty `[]` hides the dependency on the event, and it breaks if the payload is a function, because React calls `setFound(payload)` as an updater.

**When.** The value you show comes from the bus, not from the component. For the opposite direction, a value of the component that the bus must hear, use `useEmitter`.

`useEventState(event, initial)` has the signature of `useState`: it returns `[state, setState]`. `initial` is the state before the first event and may be a function, as in `useState`. After that, every emit of `event` sets the state to its payload. The hook unsubscribes when the component unmounts.

```js
// bus.js
import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

// createBus — the event bus, created once outside React
// reactPlugin — adds the hooks bus.useEmitter and bus.useEventState
export const bus = createBus().use(reactPlugin());
export const { useEventState } = bus; // a free hook: components import it without the bus
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — the event name; the handlers emit it with the found titles
export const searchLoaded = createAction("search/loaded");
```

```jsx
// Found.jsx
import { useEventState } from "./bus";
import { searchLoaded } from "./search";

export function Found() {
  // useEventState — like useState([]), but searchLoaded sets the value
  const [found, setFound] = useEventState(searchLoaded, []);

  return (
    <>
      <ul>
        {found.map((title) => (
          <li key={title}>{title}</li>
        ))}
      </ul>
      <button onClick={() => setFound([])}>Clear</button>
    </>
  );
}
```

`setFound` is the setter of React. It changes the state of this component only and emits nothing.

In TypeScript, the state type comes from the event: from `createAction<string[]>("search/loaded")` or from the event map of the bus. When the event has no payload type, as in the example above, it comes from `initial`: `["a"]` is `string[]`, and an empty `[]` is `unknown[]`. Give the event a type, or pass a typed `initial`, when you need more.

The bus keeps no values, so the hook cannot replay an event. An event emitted before the component mounts is not seen: if that matters, read the current value into `initial`.

## Keep a debounced handler between renders

**Problem.** A component runs again on every render. A policy made in its body, such as `debounce(300, search)`, is made again each time and loses its timer. A policy made once keeps the callback of the first render, which reads old props and state.

**When.** A handler in a component needs a policy, and you do not need a bus: a search box, an autosave, a submit that must not fire twice.

`usePolicy(callback, make, deps)` keeps one function between renders. It calls the `callback` of the latest render, so an inline callback sees fresh state. It cancels pending calls when the component unmounts.

```jsx
import { useState } from "react";
import { debounce } from "nanoeffects/policies";
import { usePolicy } from "nanoeffects/react";

export const Search = ({ wait }) => {
  const [items, setItems] = useState([]);

  // usePolicy — a stable function; the first argument is the latest render's callback
  const onChange = usePolicy(
    async (query, { signal }) => {
      const found = await api.search(query, { signal });
      setItems(found);
    },
    // the second argument builds the policy once; task runs the callback above
    (task) => debounce(wait, task),
    // deps — list what the second argument reads; a new wait makes a new policy
    [wait],
  );

  return (
    <div>
      <input onChange={(event) => onChange(event.target.value)} />
      <p>{items.length} found</p>
    </div>
  );
};
```

- `onChange` keeps its identity while `wait` stays the same, so it is safe in `useEffect` and in props.
- A pending call is cancelled on unmount and when `deps` change.
- Do not write `usePolicy(debounce(300, callback))`. The policy would be made on every render or keep a stale callback.
- Without a React component, use [`withPolicy`](policies.md#use-a-policy-without-a-bus).

## Where to go next

- The policies behind this form: [Policies](policies.md).
- A policy as a plain function without a bus: [Use a policy without a bus](policies.md#use-a-policy-without-a-bus).
- `retry`, `timeout` and the other effects: [Effects](effects.md).
- A state library instead of `useState`: [Stores](stores.md).
- React Query or SWR instead of your own state: [Use nanoeffects with React Query and SWR](query-libraries.md).
