# event-graph Specification

## Purpose
Builds a map of which event leads to which from what ran, exports it, and joins the maps of several runs to find listeners that never ran.

## Requirements

### Requirement: graphLogger is a trace logger from the trace entry
`graphLogger(options?)` from `nanoeffects/trace` SHALL return a trace logger that `createTracer` accepts alone or in a list, like the other loggers. It SHALL need no option, no plugin and no change to `createBus` to work. A throwing method of the logger SHALL NOT break a task, as for every logger.

#### Scenario: Works with no options
- **WHEN** a bus is made with `createTracer(graphLogger())` and a handler of `a` emits `b` through `ctx.emit`
- **THEN** the logger holds an edge from `a` to `b`

#### Scenario: Works next to other loggers
- **WHEN** `createTracer([consoleLogger(), graphLogger()])` is used
- **THEN** both receive every event

#### Scenario: Works without tracePlugin
- **WHEN** the bus does not use `tracePlugin` and a handler of `a` emits `b` through `ctx.emit`, and `b` has a handler
- **THEN** the logger holds an edge from `a` to `b`

### Requirement: The graph is built from what ran
The logger SHALL add a node for each event type and for each named listener (a listener named with `traceId`) that it sees, and an edge from a node to the node of each task or emit that the first one started, counting how many times the edge was seen. A node SHALL be the `traceId` of a listener when it has one, and the event type otherwise. An emit that nothing listens to SHALL be a node when `tracePlugin` reports it.

#### Scenario: Edges are counted
- **WHEN** a handler of `a` emits `b` three times
- **THEN** the edge from `a` to `b` has a count of 3

#### Scenario: A named listener is its own node
- **WHEN** two listeners of `total/changed` are named `recalc` and `audit` with `traceId`
- **THEN** the graph has a node for each name

#### Scenario: An emit with no listener
- **WHEN** a handler of `a` emits `b` on a bus with `tracePlugin` and nobody listens to `b`
- **THEN** the graph has the node `b` and the edge from `a` to `b`

#### Scenario: Sampled and filtered events
- **WHEN** the tracer drops an event by `sample` or `filter`
- **THEN** the logger does not see it and builds the graph from the events it got

### Requirement: The logger does not grow without a bound
The memory of the logger SHALL depend on the number of nodes and edges, not on the number of events. It SHALL keep per-task data only while the task runs. `clear()` SHALL remove the nodes, the edges, the cycles found and the counters.

#### Scenario: Repeated events
- **WHEN** the same chain runs 10 000 times
- **THEN** the graph has the same nodes and edges, and the counts are 10 000

#### Scenario: A task that ended
- **WHEN** a task ends with `done`, `error` or `cancel`
- **THEN** the logger keeps nothing for that task

#### Scenario: clear
- **WHEN** `clear()` is called
- **THEN** `toJSON()` lists no node and no edge, and `cycles()` is empty

### Requirement: The graph is exported in three formats
The logger SHALL have `toMermaid()`, `toDot()` and `toJSON()`. `toMermaid()` SHALL return a Mermaid `flowchart` and `toDot()` a Graphviz `digraph`, each with the count on its edges; the edges of a found cycle SHALL be marked. `toJSON()` SHALL return a plain object of nodes, edges and cycles that `JSON.stringify` accepts without error. Names SHALL be escaped so that an event type with a quote, a bracket or a newline does not break the output.

#### Scenario: Mermaid
- **WHEN** the graph has the edge `a` to `b` with a count of 2
- **THEN** `toMermaid()` starts with `flowchart` and has a line for that edge that shows the count 2

#### Scenario: A cycle is marked
- **WHEN** the graph has the cycle `a`, `b`, `a`
- **THEN** both formats mark the edges of the cycle

#### Scenario: Awkward names
- **WHEN** an event type is `say "hi"` or contains `]` or a newline
- **THEN** `toMermaid()` and `toDot()` output is still valid for its format

#### Scenario: Nodes can be grouped
- **WHEN** `toMermaid({ group: "prefix" })` is called and the names are `cart/changed` and `total/changed`
- **THEN** the nodes with the same part before the first `/` are in one subgraph, and `group` can also be a function of the name (the trace does not say which module a name belongs to)

### Requirement: Payloads and errors are left out unless asked
Exports SHALL contain names and counts only. `toJSON({ payload: true })` SHALL add the last payload and the last error seen for each node, made safe by the serializer. Without that option no payload and no error object SHALL appear in any export or in a cycle report.

#### Scenario: Default
- **WHEN** a payload holds a password and `toJSON()` is called
- **THEN** the password is not in the result

#### Scenario: Payload requested
- **WHEN** `toJSON({ payload: true })` is called
- **THEN** each node has its last payload, serialized safely

### Requirement: Serialization never throws and never loops
Where the logger serializes a value it SHALL return a plain JSON value for any input, and SHALL NOT throw. A getter SHALL NOT be called. A value deeper than `maxDepth` or larger than `maxSize` SHALL be a marker, not its content.

#### Scenario: Class instance with a getter that throws
- **WHEN** the value is an instance whose getter throws
- **THEN** the getter is not called and the result has the other fields

#### Scenario: Large value
- **WHEN** a payload is an array of a million items
- **THEN** the result is cut at `maxSize` with a marker

### Requirement: Serialization has a form for each kind of value
The logger SHALL write: an `Error` as its `name`, `message`, `stack` and `cause`; a circular reference as the string `"[Circular]"`; a `Map` and a `Set` as their entries; an instance of a class as its own enumerable fields with its class name; a function as `"[Function name]"`; a `bigint`, a `symbol` and a DOM node as a short string.

#### Scenario: Circular object
- **WHEN** a payload refers to itself
- **THEN** the result has `"[Circular]"` where it does

#### Scenario: Error
- **WHEN** the value is `new Error("boom", { cause: other })`
- **THEN** the result has `name`, `message`, `stack` and the serialized `cause`

### Requirement: A named listener can say where it was made
In development, `devPlugin` MAY record the call site of `bus.on` and `once` (one record for each subscription, not for each call), and `graphLogger` SHALL show it in a report and in `toJSON()` for the nodes that have it. Without `devPlugin`, nodes have no site and nothing else changes. The record SHALL be kept only while the subscription lives.

#### Scenario: With devPlugin
- **WHEN** `devPlugin` is used and a listener named `recalc` is added in `cart.js` at line 12
- **THEN** a report that names `recalc` also shows `cart.js:12`

#### Scenario: Without devPlugin
- **WHEN** `devPlugin` is not used
- **THEN** reports and exports have no site, and nothing fails

#### Scenario: Unsubscribed
- **WHEN** a listener is removed
- **THEN** its record is dropped

### Requirement: Snapshots of different runs are joined
`mergeGraphs(...snapshots)` from `nanoeffects/trace` SHALL return one `GraphSnapshot` from the snapshots it gets, without changing them. With no snapshot it SHALL return an empty graph. The result SHALL take `name` from the first snapshot that has one, and SHALL be plain data that `JSON.stringify` accepts and that `graphLogger().toJSON()` would accept as input again.

#### Scenario: Inputs are not changed
- **WHEN** snapshots are merged
- **THEN** none of them is changed

#### Scenario: No snapshot
- **WHEN** `mergeGraphs()` is called with no argument
- **THEN** it returns a graph with no node, no edge and no cycle

### Requirement: The nodes and edges of merged graphs add up
A node with the same name SHALL be one node with the sum of the counts; an edge with the same `from` and `to` SHALL be one edge with the sum of the counts and `inCycle` true if it was in any. A node SHALL keep the `site` of the first snapshot that has one and the `last` of the last snapshot that has one.

#### Scenario: Counts add up
- **WHEN** one snapshot has the edge `a` to `b` with count 2 and another has it with count 3
- **THEN** the merged graph has one edge `a` to `b` with count 5

#### Scenario: Union of nodes and edges
- **WHEN** the first snapshot has the edge `a` to `b` and the second has `a` to `c`
- **THEN** the merged graph has the nodes `a`, `b`, `c` and both edges

### Requirement: The same cycle is kept once
A cycle SHALL be kept once for the same `kind`, `source` and ring of names (the same ring found from another node is the same cycle); its `turns` SHALL add up and its `repeats` SHALL be the largest.

#### Scenario: The same cycle is one cycle
- **WHEN** both snapshots hold the cycle `a`, `b`, `a`, one of them found from `b` (`b`, `a`, `b`)
- **THEN** the merged graph has one cycle

### Requirement: Listeners the graph never saw are found
`findOrphans(described, snapshot)` from `nanoeffects/trace` SHALL take the result of `describeBus(bus)` and a `GraphSnapshot` and return the list of listeners whose node is not in the graph. Each item SHALL say the `event`, the `listener` name and a `kind`: `"unemitted"` when the graph has no node for the event, `"unrun"` when it has the node of the event but none for the listener. The function SHALL change neither argument and SHALL need no bus.

#### Scenario: A listener that did not run
- **WHEN** `described` is `{ "cart/added": ["recalc", "audit"] }` and the graph has the nodes `cart/added` and `recalc`
- **THEN** the result is `[{ event: "cart/added", listener: "audit", kind: "unrun" }]`

#### Scenario: An event that was never emitted
- **WHEN** `described` is `{ "cart/cleared": ["reset"] }` and the graph has no node `cart/cleared`
- **THEN** the result is `[{ event: "cart/cleared", listener: "reset", kind: "unemitted" }]`

#### Scenario: Everything ran
- **WHEN** every named listener of `described` has a node in the graph
- **THEN** the result is an empty list

#### Scenario: Merged coverage
- **WHEN** a listener ran in the second of two merged snapshots only
- **THEN** it is an orphan of the first snapshot and not an orphan of the merged one

### Requirement: Names that the graph has no node for
A listener whose name is `"<anonymous>"` SHALL NOT be listed, because the graph has no node for it. A name that `describeBus` wrote with `{ source: true }` (a trailing ` (file:line:column)`) SHALL be read as the name without it, and the `listener` of the item SHALL be that name.

#### Scenario: Anonymous listeners are left out
- **WHEN** a listener is named `"<anonymous>"`
- **THEN** it is not in the result

#### Scenario: Names with a source
- **WHEN** `described` has `recalc (src/cart.ts:12:3)` and the graph has the node `recalc`
- **THEN** that listener is not in the result
