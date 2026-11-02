# Debugging examples: find and cut event loops

Small scenarios, each one situation. Every file builds its own bus, runs one situation, prints what `graphLogger` found, and ends by itself. The output is the same on each run.

```bash
cd examples/debug
npm install
npm run loop-two-handlers   # one scenario
npm run run-all             # every scenario, one after another
```

A scenario is a file with a `run()` function that returns `{ findings, mermaid, notes }`, so a test can assert on it. They are tested in `src/tests/debug-examples.test.ts` of the repository. For a page with buttons and Redux DevTools see [`debug-playground`](../debug-playground).

| Command | The situation | What to look at |
| --- | --- | --- |
| `loop-two-handlers` | a cart and a total update each other | one cycle: `cart/changed → total/changed → cart/changed` |
| `loop-same-event` | a handler emits its own event | the advice: emit a different event for the result |
| `loop-async` | a loop through `await` and timers | the loop is found across the gaps |
| `loop-modules` | a loop between two modules | the diagram groups events by the part before `/` |
| `loop-microtask` | a loop made of microtasks | without the guard it runs to the limit of the test; with `loopGuardPlugin` it stops at 50 |
| `storm-component` | a component emits on every render | a storm, with no cycle path; `maxPerSecond` limits it |
| `chain-broken` | `bus.emit` inside a handler after an `await` | the loop runs, the graph sees no cycle: use `ctx.emit` |
| `export-graph` | a small app | writes `out/graph.mmd`, `out/graph.dot`, `out/graph.json` |
| `hostile-payloads` | a class instance, a `Map`, a cycle, an `Error` | the payload comes out as safe JSON |
| `clean-flow` | a diamond and a fan-out | findings: 0, no red edge |
| `ignore-recursion` | a tree walk | reported without `ignore`, quiet with it |
| `failing-handler` | a throw in the middle of a chain | no false cycle afterwards |
| `assert-no-cycles` | the CI check | `assertNoCycles(graph)` throws when the graph has a cycle |
| `find-orphans` | two sessions that each reach part of the app | a listener looks dead in one session and is gone from the list after `mergeGraphs`; one is never reached |

## See the exports

- `out/graph.mmd`: paste it into the [Mermaid live editor](https://mermaid.live), or use any Mermaid viewer.
- `out/graph.dot`: `dot -Tsvg out/graph.dot > graph.svg` (Graphviz).
- `out/graph.json`: any JSON reader.
