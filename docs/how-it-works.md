# How nanoeffects works

> **Level F.** Read first: [Guide](guide.md#1-create-a-bus).

Everything the library does with time (cancel a stale request, stop a group, unmount a module) rests on one model: a **task** with one **signal**, and tasks that follow each other's signals. This page explains that model. After it, the rules of [policies](policies.md), [effects](effects.md) and [modules](actions.md) read as one rule, not as a list of cases.

## The model in short

- `bus.emit` starts one **task** for each handler.
- Every task owns one `AbortController`. Its signal is `ctx.signal`.
- A task that a task starts (`ctx.run`, a group of an effect) **follows** the signal of its parent: when the parent aborts, the child aborts with the same reason.
- Something aborts a signal (a policy, an unmounted module, your own code). Work stops only where that signal was given.

## A task is one run of a handler

`bus.emit("search", "re")` calls every handler of `"search"`. Each call gets its own context, `ctx`, and that context is the task. The context has the event (`type`, `payload`), the signal and `abort`, and the bus methods `emit`, `on`, `off` and `run`. Your own fields from [`context`](context.md) are on it too.

A task is not a promise and not a thread. It is a signal plus the rules for what to do when it aborts. The handler may be a plain function or an `async` one; the library does not wait for it, and the task ends when the signal is no longer needed.

## Every task has one signal

`ctx.signal` is a standard `AbortSignal`, so everything that knows the platform signal works with it: `fetch`, `addEventListener`, `AbortSignal.any`. The library adds only what the platform lacks:

- `ctx.abort(reason)` aborts the signal of this task from inside.
- `onAbort(ctx, callback)` runs `callback` once, with the reason, when the signal aborts, or at once if it already has. It returns a function that removes the subscription.
- `ctx.emit` and `ctx.on` do nothing after the abort, so a cancelled handler cannot talk to the bus any more.

## Signals form a tree

A task that is started from a task follows its signal. Three things make such a child:

- `ctx.run(fn, payload)` runs `fn` as a child task.
- A group effect (`all`, `allSettled`, `race`, `transaction`) makes one child for each of its functions. Each function gets `child`: pass it to an effect, or pass `child.signal` to your API.
- An effect that takes `ctx` (`retry`, `timeout`, `poll`) listens to its signal and stops with it.

```js
import { createBus } from "nanoeffects";
import { all, onAbort } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

bus.on(
  "search",
  // latest — a new "search" aborts the signal of the previous task
  latest(async (query, ctx) => {
    // onAbort — runs when this task is aborted
    onAbort(ctx, () => console.log("search cancelled"));

    // all — two children of this task; they stop with it
    const { users, tags } = await all(ctx, {
      users: ({ signal }) => api.users(query, { signal }),
      tags: ({ signal }) => api.tags(query, { signal }),
    });

    render(users, tags);
  }),
);
```

When a second `"search"` is emitted, the tree of the first one looks like this, and `latest` aborts its root:

```text
bus.emit("search", "re")
└─ task: the handler of "search"     ctx.signal   ← aborted by latest
   ├─ group: all                     follows the task
   │  ├─ child: users                { signal } goes to api.users
   │  └─ child: tags                 { signal } goes to api.tags
   └─ run child: ctx.run(...)        follows the task
```

One abort goes down the whole subtree with one reason. A child can be aborted alone (a lost `race` starter, a failed `all`) and its parent and siblings keep going.

**A task started by `ctx.emit` is a child in the trace, not in the signal tree.** The handlers that `ctx.emit("next")` starts are new roots: aborting the emitter does not abort them. That is on purpose, since an event is a message, not a call. To tie the work of a handler to the one that emitted it, use `ctx.run`, or `emit` with `signalPlugin`, which takes `{ signal }` (see [Keep the signal through a handler](pass-the-signal.md)).

## Who aborts a signal

| Who | When |
| --- | --- |
| A [policy](policies.md) | `latest` aborts the previous call and `debounce` the one it replaces; the `cancel()` of `withPolicy` aborts the calls that have not finished. |
| A group effect | `race` aborts the losers, `all` the rest after a failure, any group when its parent aborts. |
| A module | `unmount` aborts every task of the module. |
| `signalPlugin` | A signal given to `emit(call, { signal })` aborts the tasks that this `emit` starts; one given to `on` removes the listener. |
| Your code | `ctx.abort(reason)`, or the `AbortController` you gave to a server request. |

## What an abort does, and what it does not

An abort is a request, not a kill: JavaScript cannot stop code from outside. The library does these things:

- A promise of an effect (`retry`, `delay`, `take`, a group) **rejects with the abort reason**, even if the value was produced in the same tick. An aborted task delivers no result.
- `ctx.emit` and `ctx.on` do nothing, and listeners made by `ctx.on` are removed.
- A `rollback` of [`transaction`](effects.md#transaction) still runs, because an abort is a reason to take work back. It gets no signal on purpose.

It cannot stop what ignores the signal: a `fetch` without `signal`, a timer you made yourself, a call to a client that does not take one. That work finishes, and the result is dropped because the task is aborted. This is why [Keep the signal through a handler](pass-the-signal.md) matters: the lint rules and `devPlugin` find the places where `ctx.signal` is lost.

## Where a signal from outside joins

The model starts at the bus. A signal that is born elsewhere joins it at a few places:

- [`signalPlugin`](pass-the-signal.md) gives `emit(call, { signal })`, so an abort of the caller (a request, a socket, a React effect) aborts the tasks that this `emit` starts.
- [`fromSignal`](context.md#build-a-field-from-the-signal-of-each-task) builds a field of `ctx` from the signal of each task, such as an HTTP client that stops with it.
- [`signalFetch`](pass-the-signal.md#bind-the-signal-once) is a `fetch` that takes `ctx` first.

## What it costs

- One `AbortController` for each task, and one link to its parent. `unlink` removes the link when the task ends, so a long-lived parent keeps nothing of a finished child.
- One real `abort` listener for each signal, however many subscribers `onAbort` has. A thousand subscribers on one signal are one listener and a set.
- The bus stays small (about 1.3 kB): tracing, policies and effects are separate entries that you import when you need them.

## Where to look in the source

| Part | Folder | What it holds |
| --- | --- | --- |
| Bus and tasks | `src/core` | `createBus`, `createTask`, the context, the tracer contract |
| Signals | `src/utils` | `onAbort`, `linkedController`, `raceAbort`, timers |
| Policies | `src/policies` | `latest`, `queue`, `debounce` and the rest, on one core |
| Effects | `src/effects` | `retry`, `timeout`, groups, `transaction` |
| Plugins | `src/signal`, `src/actions`, `src/trace`, `src/dev` | what you add with `bus.use` |

The exact rules of order and errors are in [Semantics](semantics.md), and what ran, in what tree, is shown by [Trace tasks](tracing.md).
