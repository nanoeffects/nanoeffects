# Cut a loop with `loopGuardPlugin`

> **Level F.** Read first: [Plugins](plugins.md#use-a-plugin). To find a loop before you cut it, see [Find and cut event loops](debugging-loops.md).

Two handlers that emit each other's events never stop. A loop made of `await` and timers burns CPU and network. A loop made of microtasks freezes the page, because the browser never gets a turn to draw. A report cannot stop any of them. `loopGuardPlugin` can: it follows the chain of emits and refuses the emit that would pass a limit.

Use it as a safety net, also in production. It needs no tracer and changes nothing while a chain stays under the limits. It is opt-in: a bus that does not use it behaves as before.

## On this page

- [Cut a loop](#cut-a-loop)
- [Choose what happens at the limit](#choose-what-happens-at-the-limit)
- [Limit the emits that come from outside](#limit-the-emits-that-come-from-outside)
- [Leave a recursion out](#leave-a-recursion-out)
- [Know what it does not do](#know-what-it-does-not-do)

## Cut a loop

The plugin counts how many times the same event is in the chain of emits that led to an emit. The chain follows `ctx.emit`, also across `await`, timers and microtasks. An emit that would pass a limit is refused, and the loop ends there. Other chains go on, and the next emit from outside starts a chain at zero.

```js
// bus.js
import { createBus } from "nanoeffects";
import { loopGuardPlugin } from "nanoeffects/guard";

// loopGuardPlugin — refuses the emit that would pass a limit of a chain
export const bus = createBus().use(
  loopGuardPlugin({
    maxRepeats: 50, // one event may be in a chain 50 times
    maxDepth: 1000, // a chain may be 1000 emits long, whatever the names are
  }),
);
```

| Option | Default | Cuts |
| ------ | ------- | ---- |
| `maxRepeats` | 50 | The same event in one chain too often: a loop. |
| `maxDepth` | 1000 | A chain that is too long, also when every event has a new name (`step/${n}`). |
| `maxPerSecond` | none | Emits of one event from outside any handler that come too fast ([below](#limit-the-emits-that-come-from-outside)). |
| `ignore` | none | Event names that the repeat count skips ([below](#leave-a-recursion-out)). |

## Choose what happens at the limit

`onLimit` says what the refused emit does. Either way the plugin reports the finding once for each path. The report has the path of the loop and never the payload.

```js
// bus.js
import { createBus } from "nanoeffects";
import { LoopError, loopGuardPlugin } from "nanoeffects/guard";

export const bus = createBus().use(
  loopGuardPlugin({
    onLimit: "drop", // "drop" (default): the emit is not sent; "throw": it throws a LoopError
    // report — replaces the default console.error
    report: (finding) => console.error(finding.limit, finding.path.join(" → ")),
  }),
);

// with onLimit: "throw", the emit that was refused throws, and the error names the path
try {
  bus.emit("cart/changed");
} catch (error) {
  if (error instanceof LoopError) {
    console.log(error.limit, error.path);
  }
}
```

- **`"drop"`** is the default. The emit returns as if nobody listened, so no new error appears in an async handler.
- **`"throw"`** shows the loop with a stack. In an async handler the error becomes a rejection: handle it with `onError`.

A loop that is cut can leave the state of the app half done: the handlers that ran have done their part, the ones after the cut have not. Fix the loop, and keep the guard as a net.

## Limit the emits that come from outside

A component that emits on every render has no chain: each emit comes from outside any handler. `maxPerSecond` counts them for each event.

```js
// bus.js
import { createBus } from "nanoeffects";
import { loopGuardPlugin } from "nanoeffects/guard";

// maxPerSecond — over 100 emits of one event in a second from outside are refused
export const bus = createBus().use(loopGuardPlugin({ maxPerSecond: 100 }));
```

It is off by default, because a burst of many emits can be right (a stream of messages).

## Leave a recursion out

A chain that repeats on purpose is cut too. A handler that emits `tree/visit` for each level of a tree, or one that emits `tick` again after a timer for hours, passes `maxRepeats`. List its event in `ignore`. `maxDepth` still applies to it.

```js
// bus.js
import { createBus } from "nanoeffects";
import { loopGuardPlugin } from "nanoeffects/guard";

export const bus = createBus().use(
  loopGuardPlugin({
    ignore: ["tree/visit"], // names, or a function of the name
  }),
);
```

## Know what it does not do

- **It does not abort the chain.** It refuses one emit, at the edge where the limit is passed. The handlers that already run, run to the end.
- **It follows `ctx.emit`.** A `bus.emit` called from inside a handler is not part of the chain: it starts a new one with the counts at zero. Use `ctx.emit` inside handlers.
- **It does not find a loop.** To see the path of a loop, and loops that go through components, use `graphLogger` ([Find and cut event loops](debugging-loops.md)).
