## ADDED Requirements

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
Where the logger serializes a value it SHALL return a plain JSON value for any input, and SHALL NOT throw. It SHALL handle:

- an `Error` as its `name`, `message`, `stack` and `cause`;
- a circular reference as the string `"[Circular]"`;
- a `Map` and a `Set` as their entries;
- an instance of a class as its own enumerable fields with its class name;
- a function as `"[Function name]"`, and a `bigint`, a `symbol` and a DOM node as a short string;
- a value deeper than `maxDepth` or larger than `maxSize` as a marker, not its content.

A getter SHALL NOT be called.

#### Scenario: Circular object
- **WHEN** a payload refers to itself
- **THEN** the result has `"[Circular]"` where it does

#### Scenario: Error
- **WHEN** the value is `new Error("boom", { cause: other })`
- **THEN** the result has `name`, `message`, `stack` and the serialized `cause`

#### Scenario: Class instance with a getter that throws
- **WHEN** the value is an instance whose getter throws
- **THEN** the getter is not called and the result has the other fields

#### Scenario: Large value
- **WHEN** a payload is an array of a million items
- **THEN** the result is cut at `maxSize` with a marker

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
