# Find a loop: a playground for the graph logger and Redux DevTools

A page with a button for each shape of loop. A loop ends by itself after a few dozen turns, so the page is safe to press. For each button you see the report of `graphLogger`, the graph drawn with the cycle in red, and the same finding as a `cycle/detected` action in Redux DevTools.

```bash
cd examples/debug-playground
npm install
npm run dev
```

## See it in Redux DevTools

Redux DevTools is a browser extension and a StackBlitz preview runs in a frame, so open the preview in its own tab. Pick the instance named **debug playground** in the extension.

After a button:

- The list has the emits of the loop (`cart/changed`, `total/changed`, ...), one action for each.
- A `cycle/detected` action appears once for a loop, with the `path`, the `root` and the number of `repeats`. Its state is `{ findings: N }`.
- Without the extension the page still shows the report and the graph, and nothing throws.

## What each button shows

| Button | Loop | What to look at |
| --- | --- | --- |
| Two handlers | `cart/changed` ↔ `total/changed` | one cycle with the path of both events |
| Same event | `clear` emits `clear` | the advice to emit a different event |
| Across await | `tick` ↔ `tock` with a pause | the loop is found across the gaps |
| Microtasks | `spin` awaits and emits `spin` | turn the guard on: the loop stops after 20 repeats and the page stays responsive |
| Component storm | 300 emits of `filters/changed` | a `storm`, with no chain |

The box turns on `loopGuardPlugin` (`maxRepeats: 20`). It refuses the emit that would pass the limit and says so in the report.
