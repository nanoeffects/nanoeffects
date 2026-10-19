# Policies

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

## Queue

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
