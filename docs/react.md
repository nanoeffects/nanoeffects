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

## Where to go next

- The policies behind this form: [Policies](policies.md).
- `retry`, `timeout` and the other effects: [Effects](effects.md).
- A state library instead of `useState`: [Stores](stores.md).
