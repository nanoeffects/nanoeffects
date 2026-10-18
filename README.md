# nanoeffects

A typed event bus where every handler is a **task**: it gets a context with an `AbortSignal`, and the policies that decide what happens when calls overlap (`latest`, `debounce`, `throttle`, `queue`, ...) are plain functions around the handler.

```ts
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { retry } from "nanoeffects/effects";

type Events = { search: string; results: Item[] };

const bus = createBus<Events>();

// a new search aborts the previous one; the request is retried and cancelled with the task
bus.on(
	"search",
	latest(async (query, ctx) => {
		const items = await retry(ctx, () => api.search(query, { signal: ctx.signal }));
		ctx.emit("results", items); // does nothing if this task was aborted meanwhile
	}),
);

bus.emit("search", "nano");
```

What it is for: the glue between events and async work in an app, where the usual answer is a pile of `AbortController`s, `debounce` from lodash, `p-queue` and a hand-written retry. Here they share one model of cancellation and one trace.

- **Tiny core.** `createBus` is about 1.2 kB gzip. Everything else is a separate entry and is bundled only when imported.
- **Cancellation is the base of everything.** Aborting a task aborts its children, ends its `ctx.on` subscriptions and drops its result.
- **Policies and effects are functions**: `latest`, `leading`, `debounce`, `throttle`, `queue`, `retry`, `timeout`, `poll`, `all`, `allSettled`, `race`, `take`.
- **Typed commands, actions, jobs and modules** to describe what the app does apart from the code that does it.
- **Tracing by design**: causal links between tasks, sampling, Redux DevTools, and a build that cuts all of it out.
- **Checked against the libraries it replaces**: `throttle` and `debounce` are compared with lodash on random call sequences, and known issues of lodash, RxJS, p-queue, p-retry, bottleneck and effector are regression tests.

## Entries

| Import                  | What is in it                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `nanoeffects`           | `createBus`, the types (`Bus`, `Context`, `Task`, ...)                                 |
| `nanoeffects/policies`  | `latest`, `leading`, `debounce`, `throttle`, `queue`                                   |
| `nanoeffects/effects`   | `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `cancellable`, `onAbort` |
| `nanoeffects/actions`   | `createAction`, `createCommand`, `createCommands`, `createJob`, `createModule`, `registerModules` |
| `nanoeffects/redux`     | `createEffectsMiddleware`, `nanoeffectsMiddleware`: Redux actions to the bus, `ctx.store` in tasks |
| `nanoeffects/trace`     | `createTracer` and the loggers                                                         |

## Handlers and the task context

`bus.on(event, handler)` calls `handler(payload, ctx)` for every `bus.emit(event, payload)`. Each call is a task with its own context:

| `ctx`            | Meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `signal`, `abort` | the abort signal of the task, and a way to abort it (and its children)         |
| `emit`           | emit as this task; does nothing after the task is aborted                      |
| `on`, `off`      | subscribe as this task; the subscription ends when the task aborts             |
| `run(fn, ...)`   | a child task: aborted with this one, its errors go to this one                 |
| `type`, `payload` | the event the task works on                                                    |

`emit` is a synchronous loop over the handlers, and `bus.on` returns the function that unsubscribes.

**The event map is optional.** Describe the events once, `type Events = { name: Payload }` (an event without data is `void`), and `createBus<Events>()` checks every `on` and `emit`. Or skip it: `createBus()` takes any string as an event and passes the payload as `unknown`. Actions and commands bring their own types, so they are typed on either kind of bus: `bus.on(userLoaded, (user) => ...)` gives `user` its type from `createAction<User>(...)`. On a bus with an event map, an action or a command that is emitted by its object must have its type in the map.

## Policies

A policy wraps a handler and decides what happens when calls overlap. Every policy takes `key` in its options (see below), so each key has its own state.

| Policy                         | Overlapping calls                                                          |
| ------------------------------ | -------------------------------------------------------------------------- |
| `latest(fn)`                   | the previous run is aborted and its result dropped                        |
| `leading(fn)`                  | new calls are dropped while a run is going                                |
| `debounce(ms, fn, options?)`   | run after `ms` of quiet                                                    |
| `throttle(ms, fn, options?)`   | at most one run per `ms`                                                   |
| `queue(fn, options?)`          | one after another, in order                                                |

`debounce` and `throttle` take `leading` and `trailing`:

- `throttle(ms, fn)` works like lodash `throttle` (and patronum): a call made when the throttle is idle, at least `ms` after the previous call and the previous run, runs at once (`leading`, default `true`); calls made while it waits are held, and the latest of them runs when the window closes (`trailing`, default `true`). Under a steady stream of calls it runs every `ms`. `leading: false` makes even the first call wait for the end of its window; `trailing: false` drops the calls made during a window.
- `debounce(ms, fn)` runs the last call after `ms` of quiet (`trailing`, default `true`). `leading: true` also runs the first call of a burst at once, and then the trailing run happens only if more calls follow it. `leading: true, trailing: false` runs only the first call of a burst.
- With both options `false` nothing runs.
- `throttle` and `debounce` are checked against lodash itself: the tests feed random sequences of calls to both and compare the moments `fn` runs.

`key` gives each key its own state, so calls with different keys do not affect each other:

```ts
// one latest run per user instead of one for all of them
bus.on("load", latest(loadUser, { key: (user) => user.id }));

// uploads of the same file go one after another, different files in parallel
bus.on("upload", queue(upload, { key: (file) => file.name }));
```

The state of a key is dropped when that key goes idle, so keys can be unbounded (ids, urls).

### Queue

`queue(fn, options?)` runs the calls of a handler one after another, in the order they arrived, instead of dropping or replacing them like `leading` and `latest` do:

```ts
import { queue } from "nanoeffects/policies";

bus.on(
	"save",
	queue(async (draft, { signal }) => {
		await api.save(draft, { signal });
	}),
);

bus.emit("save", a); // runs now
bus.emit("save", b); // waits for a, then runs
```

- `concurrency` (default 1) is how many calls may run at the same time.
- `limit` caps how many calls may wait, and `overflow` says what to drop when the line is full: the new call (`"drop-new"`, the default) or the oldest waiting one (`"drop-old"`). A dropped call resolves with `undefined`. `queue(fn, { limit: 1, overflow: "drop-old" })` keeps only the latest call while one is running and runs it when the current one is done; `limit: 0` lets nothing wait.
- Every call returns a promise with the result of its own run. An error rejects only that call and the queue goes on.
- A waiting call whose task aborts is skipped and resolves with `undefined`. When the task of a running call aborts, its slot is freed at once and its result is dropped, so pass `signal` to what `fn` does: a `fn` that ignores it can overlap with the next run.

## Effects and cancellation

An abort only raises a flag: your code decides to stop. `nanoeffects/effects` has helpers for the usual cases.

`delay(ctx, ms)` waits and rejects on abort (`ms` can be a function). `cancellable(ctx, executor)` is a promise tied to the task signal; it works like `new Promise`, but the executor gets one object, `{ resolve, reject, onCancel }`, with `onCancel` for cleanups:

```ts
import { cancellable } from "nanoeffects/effects";

bus.on(
	"wait",
	latest((_, ctx) =>
		cancellable<void>(ctx, ({ resolve, onCancel }) => {
			const timer = setTimeout(resolve, 5000);
			onCancel(() => clearTimeout(timer));
		}),
	),
);
```

- If the task aborts before the promise settles, cleanups run (last registered first) and the promise rejects with the abort reason.
- If the task is already aborted, the executor does not run.
- After the promise settles, the abort listener is removed and cleanups are dropped.

`onAbort(ctx, fn)` runs `fn(reason)` on abort (at once if already aborted) and returns a function that unsubscribes:

```ts
import { onAbort } from "nanoeffects/effects";

bus.on("connect", (url, ctx) => {
	const socket = new WebSocket(url);
	onAbort(ctx, () => socket.close());
});
```

### allSettled

`allSettled(ctx, effects)` is `all` that waits for every starter and never fails because of one: each result is `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`, in the shape of the input (object or array). Nothing is cancelled when a starter fails. Only an abort of `ctx` rejects it.

```ts
const { user, posts } = await allSettled(ctx, {
	user: ({ signal }) => fetchUser(id, { signal }),
	posts: ({ signal }) => fetchPosts(id, { signal }),
});

if (user.status === "fulfilled") render(user.value);
```

### Subscribing from a task: ctx.on, ctx.off, take

A task context has `on` and `off`, like the bus. A subscription made with `ctx.on` ends when the task aborts, so it cannot outlive the work that needed it:

```ts
bus.on("watch", (_, ctx) => {
	ctx.on("tick", (n) => console.log(n)); // gone when this task aborts
});
```

- The returned function unsubscribes sooner. After the task is aborted, `ctx.on` does nothing.
- A policy passes its handler a child context, so under `latest` the subscriptions of a superseded run end with it.
- `ctx.off` is the bus `off`: `ctx.off(event)` clears every handler of the event, not only the task's.

`take(ctx, event, options?)` waits for the next `event` and resolves with its payload:

```ts
import { take, timeout } from "nanoeffects/effects";

bus.on("login", async (user, ctx) => {
	const reason = await take(ctx, "logout"); // resolves on the next logout
	cleanup(user, reason);

	// wait for a matching event, but not longer than 5 s
	const id = await timeout(ctx, 5000, ({ signal }) =>
		take(ctx, "saved", { signal, predicate: (id) => id === draft.id }),
	);
});
```

- It sees only events emitted after the call, takes one, and unsubscribes.
- `options.predicate` skips payloads it rejects; `options.signal` stops the wait, which is how a `race` or `timeout` starter cancels it.
- On abort of the task or of `options.signal` it unsubscribes and rejects with the abort reason. It is traced as a `take` group.

### retry, timeout, poll

```ts
import { poll, retry, timeout } from "nanoeffects/effects";

bus.on("load", async (id, ctx) => {
	// up to 4 attempts, backoff between them; stops when the task aborts
	const user = await retry(ctx, () => fetchUser(id, { signal: ctx.signal }), {
		times: 4,
		delay: (attempt) => 2 ** attempt * 100,
		shouldRetry: (error) => !isFatal(error),
	});

	// aborts the starter's signal and rejects with a TimeoutError after 5 s
	const data = await timeout(ctx, 5000, ({ signal }) => fetchData(id, { signal }));

	// calls refresh every 10 s; resolves when the task aborts
	await poll(ctx, () => refresh(), 10_000);
});
```

- `retry`: `times` is the total number of attempts (default 3), `delay` is a number or `(attempt, error) => ms`, `shouldRetry(error, attempt)` can stop early. `fn` gets the attempt number, starting at 1. On abort it rejects with the abort reason.
- `timeout`: the error is a `DOMException` named `TimeoutError`, like `AbortSignal.timeout`. It rejects even if the starter ignores its signal.
- `poll`: like patronum `interval`. The first call comes after `ms` (`leading: true` also calls at once), and the next ticks keep a steady rate whatever the duration of `fn`, so a slow `fn` can overlap with the next call; `waitForFn: true` starts each pause when the call ends instead, so calls never overlap. `fn` gets the call number from 0. An error from `fn` stops polling and rejects; an abort ends it normally and clears the timer.
- A pause can be a function wherever a time is given, for backoff or jitter: `retry`'s `delay` gets `(attempt, error)`, `poll`'s `ms` gets the number of the call the pause leads to, and `delay` itself takes a function called once when it starts:

```ts
retry(ctx, load, { times: 5, delay: (attempt) => 2 ** attempt * 100 }); // 200, 400, 800, ...
poll(ctx, refresh, (call) => Math.min(1000 * 2 ** call, 60_000)); // slows down to once a minute
await delay(ctx, () => 200 + Math.random() * 200); // 200 to 400 ms
```

- All three are traced: the effect is a group (`retry`, `timeout`, `poll`) and each attempt or call is a `run` child.

In every effect `ctx` is the first argument: `delay(ctx, ms)`, `all(ctx, effects)`, `allSettled(ctx, effects)`, `race(ctx, effects)`, `cancellable(ctx, executor)`, `onAbort(ctx, fn)`, `retry(ctx, fn, options)`, `timeout(ctx, ms, starter)`, `poll(ctx, fn, ms, options)`, `take(ctx, event, options)`. It is required; outside a task pass `{}` or any object with a `signal`.

For `fetch` and other APIs that take a signal, pass `ctx.signal`. A timeout without `race`: `AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)])`.

## Actions, commands and jobs

`nanoeffects/actions` has the pieces to describe what a bus does, apart from the code that does it.

```ts
import { createAction, createCommand, createJob } from "nanoeffects/actions";

// an event with a payload, as in Redux Toolkit
const userLoaded = createAction<User, "user/loaded">("user/loaded");
const loadFailed = createAction<Error, "user/failed">("user/failed");

// a request for a result: emit it and get what its handler returns
const getUser = createCommand("user/get", (id: string, { signal }) => fetchUser(id, { signal }));

// a contract without a handler: the code that sends mail is elsewhere
const sendMail = createCommand<Mail, void>("mail/send");

// a command whose outcome is sent on as events
const loadUser = createJob("user/load", fetchUser, { done: userLoaded, fail: loadFailed });
```

**Actions.** `createAction(type)` returns a creator: `userLoaded(user)` is `{ type, payload }`, `userLoaded.type` is the type, `userLoaded.match(action)` narrows an action. `createAction(type, prepare)` builds the payload from several arguments. A creator works as the event of its type: `bus.emit(userLoaded(user))`, `bus.on(userLoaded, fn)`.

**Commands.** `bus.emit(command, payload)` tells the listeners of the command's type, then runs its handler as a task, with a context, and returns the result. The handler can be wrapped in a policy, `createCommand("search", latest(fn))`. Calling `command(payload)` runs its own handler without a bus.

**Where handlers are registered.** The command may carry a handler. The bus gets the handlers bound to commands from a registry, `createCommands`, and a handler bound there wins over the command's own. The registry belongs to one bus, as an effector scope does with `fork({ handlers })`, so each bus (each test) can have its own.

```ts
import { createCommands, bindHandler } from "nanoeffects/actions";

const commands = createCommands<Events>([bindHandler(sendMail, smtpSend)]);
const bus = createBus<Events>({ commands });

const unbind = commands.handle(getUser, async () => fakeUser); // later, e.g. in a test
unbind(); // the command's own handler is back; the latest binding wins
```

A command with no handler anywhere throws `No handler for command "..."` from `emit`. The registry lives in `nanoeffects/actions`, so a bus without `commands` carries none of this code; without it `emit(command, payload)` simply runs the command's own handler.

**Jobs.** `createJob(type, handler, { done, fail })` is a command that sends its outcome on, for when nobody waits for the result. `done` receives the result and `fail` receives the error; each is anything `emit` takes: an event type, an action creator, a command, or a plain action. `bus.emit(job, payload)` still returns a promise of the result. With `fail` set the error counts as handled: it goes to `fail` and the promise resolves with `undefined`; without it the promise rejects. The outcome is routed also for a handler bound with `commands.handle`, and is not sent once the task is aborted.

## Modules

`registerModules(bus, modules)` from `nanoeffects/actions` assembles an app from modules and returns `mount`, `unmount`, `isMounted` and `dispose`. Create the bus with the registry of `createCommands`, so the commands that modules bind are the ones it runs:

```ts
const userModule = createModule<Events>("user", (m) => {
  m.handle(getUser, fetchUser);
  m.on("login", (user, ctx) => ctx.emit("loaded", user));
  m.spawn(async (_, ctx) => { /* background work, ends with the module */ });
});

const commands = createCommands<Events>();
const bus = createBus<Events>({ commands });
const app = registerModules(bus, [userModule]);

const unmount = app.mount(orderModule); // later, e.g. after a lazy import
commands.handle(getUser, fakeUser); // in a test
app.dispose(); // unmounts every module
```

The bus has `context`, `trace` and `commands` as read-only fields (the options), for code that makes tasks of its own, like `registerModules`.

## Your own fields in the context

`createBus({ context })` adds fields to the context of every task of the bus: handlers, `ctx.run`, listeners added with `ctx.on`, commands, modules and the child tasks of effects and policies. Use it for a store, a client or a logger that the tasks share. Declare the types once, globally:

```ts
declare global {
  interface NanoeffectsContext {
    store: Store;
  }
}

const bus = createBus<Events>({ context: { store } });
bus.on("save", (draft, { store }) => store.put(draft));
```

The fields of the library (`signal`, `emit`, `run`, ...) win when the names are the same. Modules get these fields too. `context` can also be a function, `(task) => fields`, called with `{ type, payload }` of each task, for fields that depend on the task.

## Redux

`createEffectsMiddleware()` from `nanoeffects/redux` gives you a bus and the Redux middleware that feeds it: the effects of an app in one place, without sagas. Every action goes to the bus after the reducers have handled it, so a handler that reads the store sees the new state, and every task gets `ctx.store` (`dispatch` and `getState`).

```ts
declare global {
  interface NanoeffectsContext {
    store: ReduxStoreApi<RootState>;
  }
}

const effects = createEffectsMiddleware<Events>();

const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().concat(effects.middleware),
});

effects.bus.on(userRequested, latest(async (id, { store, signal }) => {
  store.dispatch(userLoaded(await fetchUser(id, { signal })));
}));
```

It looks after what is easy to get wrong:

- **A handler does not loop on its own action.** An action that a handler dispatches through `ctx.store` and that has the type the handler works on does not go back to the bus. The action is not marked or changed: the middleware remembers which task dispatched it. Other handlers of that type do not get it either. Longer cycles, `a` to `b` to `a`, are yours to avoid.
- **A failing handler does not break `dispatch`.** Errors go to `onError` (default `console.error`), as in Redux Toolkit listeners. Reducers still throw to the caller.
- **The store gets to the tasks by itself**, though the bus is made before the store: `ctx.store` appears when the middleware is added.

Options are those of `createBus` (except `context`, which adds fields next to `store`) and `filter`, which keeps the actions it rejects away from the bus. Values that are not plain actions (thunks) go through untouched. Nothing here depends on Redux.

To use your own bus, `nanoeffectsMiddleware(bus, { filter })` is the middleware alone: it sends actions to the bus after the reducers and nothing more. Give the store to the tasks yourself with `createBus({ context: { store } })`, or lazily, `context: { get store() { return store; } }`, since the store needs the middleware and the middleware needs the bus.

## Zustand, MobX and other stores

No adapter is needed: a store tells about its changes, and `bus.emit` is a call.

```ts
// Zustand
const stop = store.subscribe((state, previous) => {
  if (state.user !== previous.user) bus.emit(userChanged, state.user);
});

// MobX
const stop = reaction(() => store.user, (user) => bus.emit(userChanged, user));

bus.on(userChanged, latest((user, { signal }) => sync(user, { signal })));
```

Stop watching with what the store returned: `onAbort(ctx, stop)` inside a task, or `m.signal.addEventListener("abort", stop)` in a module.

The other way, give the store to the tasks, `createBus({ context: { store } })`, and change it from a handler: `setState` for Zustand, an action of the MobX store (it wraps `runInAction`). A handler that changes the value it was started by emits the event again, so watch the smallest part of the state. For a MobX `flow`, `onAbort(ctx, () => promise.cancel())` cancels it with the task.

## Errors in handlers

`emit` is a plain loop over the handlers, like in nanoevents: if a handler throws, the remaining handlers are skipped and the error reaches the caller of `emit`. A rejected promise of an async handler is left unhandled.

Pass `onError` to isolate handlers instead. Then every handler runs, and thrown errors and rejections of async handlers (including ones wrapped in `latest`, `debounce` and the like) go to `onError`; an `onError` that throws is logged to `console.error`.

```ts
const bus = createBus<Events>({
	onError: (error, { type, payload }) => report(error, type, payload),
});
```

## Tracing

Pass `trace` to `createBus` to observe every task phase. Make it with `createTracer` from `nanoeffects/trace`, which takes a logger (a function) or an array of them. The tracing code lives in that entry, so a bus without `trace` does not carry it.

```ts
import { createBus } from "nanoeffects";
import { createTracer } from "nanoeffects/trace";

const bus = createBus<Events>({
	trace: createTracer((event) => console.log(event)),
});
```

Each `TraceEvent` has:

| Field     | Meaning                                                              |
| --------- | -------------------------------------------------------------------- |
| `id`      | Unique task id within the bus.                                       |
| `parent`  | Id of the task that started this one (absent for handler tasks).     |
| `type`    | Event type the task works on.                                        |
| `effect`  | `latest`, `debounce`, `throttle`, `leading`, `run`, `all` or `race`. |
| `phase`   | `start`, `done`, `error`, `cancel` or `drop`.                        |
| `payload` | Event payload.                                                       |
| `error`   | Thrown value, only for `error`.                                      |

Phases:

- `start`: the work began.
- `done` / `error`: it finished or threw.
- `cancel`: it was aborted after it started (superseded by `latest`, parent aborted, lost a `race`).
- `drop`: it never started (`leading` while busy, a `throttle` call replaced by a newer one, a `debounce` call replaced before its delay ended).

`all` and `race` are traced when you pass them the handler `ctx`: the group is one task, every starter is a child `run` task.

```ts
bus.on("load", async (id, ctx) => {
	await all(ctx, { user: () => fetchUser(id), posts: () => fetchPosts(id) });
});
```

## Loggers

A logger is a function `(event: TraceEvent) => void` (the `TraceLogger` type). `createTracer` takes one logger or an array; a logger that throws is reported to `console.error` and never breaks the task or the other loggers.

```ts
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, reduxDevtools } from "nanoeffects/trace";

const bus = createBus<Events>({
	trace: createTracer([reduxDevtools({ name: "app" }), consoleLogger()]),
});
```

`nanoeffects/trace` ships `createTracer` and these loggers, each a factory that returns a `TraceLogger`:

| Logger                  | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `reduxDevtools()`       | Sends each phase to Redux DevTools as `type/effect/phase`; state is `{ running }`.   |
| `consoleLogger()`       | Prints one line per phase, indented by task depth.                                   |
| `performanceLogger()`   | Records User Timing measures for the Timings track of the browser Performance panel. |
| `createTraceRecorder()` | Keeps events in `recorder.events`, for tests.                                        |

### Production: filter and sampling

`createTracer(loggers, options)` can cut the volume:

```ts
createTracer(logger, {
	sample: 0.05, // trace 5% of the handler calls (a share, or a function of { type, payload })
	filter: (event) => event.phase === "error", // and keep only failures
});
```

- `sample` is decided once per root task (one handler call) and every task below it follows, so a trace is never cut in the middle. Tasks that are not sampled cost almost nothing: their effects run without tracing.
- `filter` runs on each event before any logger sees it.

Notes on `reduxDevtools`: it is read-only (the bus owns no state, so there is no time travel) and does nothing when the extension is not installed.

To write your own, return a `TraceLogger`:

```ts
import type { TraceLogger } from "nanoeffects";

const errorsOnly = (): TraceLogger => (event) => {
	if (event.phase === "error") report(event.error);
};
```

## Removing tracing from a build

Without a tracer the hooks cost almost nothing (a lookup that finds no tracer), and `nanoeffects/trace` is a separate entry that is only bundled when imported. To also drop the tracing code from the core, use the `notrace` export condition: the package ships a second build of `index`, `effects`, `policies` and `actions` made with `__NANOEFFECTS_TRACE__` set to `false`, so the bundler removes the tracer calls.

```ts
// vite / rolldown
resolve: { conditions: ["notrace"] }
// webpack
resolve: { conditionNames: ["notrace", "import", "..."] }
// esbuild
conditions: ["notrace"]
```

In a build of your own from the sources, `define: { __NANOEFFECTS_TRACE__: "false" }` does the same. With the condition set, the types of that build have no `trace` option: `createBus({ trace })` is a type error, so tracing cannot be left on by mistake (`scripts/notrace-types.mjs` makes `BusOptions.trace` `never` there). `nanoeffects/trace` has no `notrace` build. The saving is about 0.4 kB gzip of the whole library.

## Semantics

- **An aborted task delivers no result.** If the task aborts before a promise settles, the promise rejects with the abort reason, even if the value was just produced in the same tick. `latest`, `debounce`, `all`, `race`, `take` and the rest follow this rule.
- **`emit` is a plain, synchronous loop** (see "Errors in handlers"). A `ctx.emit` inside a handler is the same call: without `onError` an error of a nested handler is thrown into the handler that emitted; with `onError` it goes there and `ctx.emit` does not throw.
- **Rejections of async handlers** are not handled for you. Without `onError` they are unhandled rejections, which end a Node process by default. Use `onError` for async handlers.
- **`leading` releases its lock when the task aborts**, not only when `fn` settles. A `fn` that ignores the abort signal can then overlap with the next run, so pass `ctx.signal` to what `fn` does.
- **Effects start their function synchronously**, so an event emitted right after the call reaches a `take` inside it.

## Development

```bash
pnpm test       # vitest, 1000+ tests
pnpm tsgo       # type check
pnpm check      # biome with the readability plugins in lint/
pnpm build      # tsdown: dist/ and dist/notrace/
```

`AGENTS.md` (also read by Claude Code through `CLAUDE.md`) describes the structure, the decisions behind it and the rules of the code, for people and for AI assistants that work on the project.
