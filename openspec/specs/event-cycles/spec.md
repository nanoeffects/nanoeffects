# event-cycles Specification

## Purpose
Finds loops in a trace while the app runs, reports each once with where the chain began, and stops nothing.

## Requirements

### Requirement: A node that repeats in a chain is a cycle
While the app runs, `graphLogger` SHALL report a cycle when a node appears `repeats` times in the chain of a task: the task itself and its ancestors by `parentId`. `repeats` SHALL default to 3 and be an option. The chain SHALL cross asynchronous gaps (`await`, timers), so a loop that returns to its start after a delay is a cycle too, and a synchronous re-entry of the same listener is one.

#### Scenario: Two handlers feed each other
- **WHEN** a handler of `cart/changed` emits `total/changed` and a handler of `total/changed` emits `cart/changed`, and the chain passes `cart/changed` three times
- **THEN** one cycle is reported with the path `cart/changed`, `total/changed`, `cart/changed`

#### Scenario: A loop across an await
- **WHEN** the handler of `a` waits 100 ms and then emits `b`, and the handler of `b` emits `a`
- **THEN** the cycle is reported as for a synchronous chain

#### Scenario: A listener that emits its own event
- **WHEN** a handler of `a` emits `a`
- **THEN** a cycle is reported when `a` has repeated `repeats` times in the chain

#### Scenario: A long chain with no repeat
- **WHEN** a chain of 200 different events runs
- **THEN** no cycle is reported

#### Scenario: A repeat below the limit
- **WHEN** `a` appears twice in a chain and `repeats` is 3
- **THEN** no cycle is reported

#### Scenario: Siblings are not a cycle
- **WHEN** one handler emits `b` five times, and no `b` handler emits again
- **THEN** no cycle is reported

### Requirement: A cycle is reported once per path
For one path the logger SHALL report once, however many times the loop turns after that. A different path SHALL be reported separately. A found cycle SHALL be in `cycles()` as `{ path, repeats }`, where `path` is the list of node names that start and end at the repeating node.

#### Scenario: Not repeated
- **WHEN** the same loop runs 1 000 more turns after it was reported
- **THEN** no further report is made for that path

#### Scenario: Two paths
- **WHEN** two different loops run
- **THEN** each is reported once and `cycles()` has two entries

### Requirement: Nothing is stopped
Detection SHALL NOT abort, delay or change any task, emit or handler result. The logger SHALL only report.

#### Scenario: The loop keeps running
- **WHEN** a cycle is reported
- **THEN** the handlers go on being called as they would without the logger

### Requirement: A report goes to the console unless replaced
By default a cycle SHALL be written once with `console.warn`, with the path, the number of repeats, and the `traceGroupId` when the chain has one. With `onCycle`, the logger SHALL call it with the cycle and SHALL NOT write to the console. A throwing `onCycle` SHALL NOT break the task. With `devtools: true` the logger SHALL also send an action `cycle/detected` with the path to Redux DevTools; without the extension nothing SHALL be sent and nothing SHALL throw. The report SHALL contain no payload.

#### Scenario: Default report
- **WHEN** a cycle is found and `onCycle` is not set
- **THEN** `console.warn` is called once with the path

#### Scenario: onCycle replaces the warning
- **WHEN** `onCycle` is set
- **THEN** it is called with the cycle and `console.warn` is not

#### Scenario: onCycle throws
- **WHEN** `onCycle` throws
- **THEN** the task goes on and the error is reported as for any failed logger

#### Scenario: DevTools
- **WHEN** `devtools: true` is set and the extension is installed
- **THEN** one action `cycle/detected` with the path is sent

#### Scenario: No extension
- **WHEN** `devtools: true` is set and the extension is not installed
- **THEN** nothing throws and the console report still happens

### Requirement: Emits from outside a task are counted as a storm
An emit that has no parent task (from a component, a timer, a test) SHALL be counted by event type. When one type is emitted `count` times within `perMs` milliseconds the logger SHALL report a storm once for that type per window, through the same channels as a cycle. The default SHALL be 100 emits in 1000 ms. `storm: false` SHALL turn it off.

#### Scenario: Component emits on every render
- **WHEN** `filters/changed` is emitted 100 times from outside a handler within one second
- **THEN** one storm is reported for `filters/changed`

#### Scenario: Slow emits
- **WHEN** the same event is emitted 100 times over ten seconds
- **THEN** no storm is reported

#### Scenario: Emits from handlers are not counted
- **WHEN** a handler emits an event 100 times in a second
- **THEN** no storm is reported for it (a cycle is judged by the chain)

#### Scenario: Turned off
- **WHEN** `storm: false` is set
- **THEN** no storm is ever reported

### Requirement: A missing tracePlugin is said once
When the logger gets a task but never an event with `effect: "emit"`, it SHALL write one message that the graph is coarser without `tracePlugin`, as `reduxDevtools` does, and SHALL go on working.

#### Scenario: No tracePlugin
- **WHEN** handler tasks run and no emit event arrives
- **THEN** one message is written, and cycles are still found by event type

#### Scenario: With tracePlugin
- **WHEN** emit events arrive
- **THEN** the message is not written

### Requirement: No cost on a bus without a tracer
A bus without `trace`, or a build with tracing off, SHALL run the same as before and the logger SHALL never be called.

#### Scenario: Notrace build
- **WHEN** the `notrace` build is used with `createTracer(graphLogger())`
- **THEN** the logger receives no event and nothing is reported

### Requirement: A task that ends frees its place in every way it can end
A task that ends with `done`, `error`, `cancel` or `drop` SHALL leave no trace in the chains of the logger. A handler that throws in the middle of a chain SHALL NOT make a later, unrelated chain look like a cycle.

#### Scenario: A throw in the middle
- **WHEN** a handler of `b` throws while handling a chain `a`, `b`, `c`, and later the same chain runs again and does not loop
- **THEN** no cycle is reported for the second run

#### Scenario: A cancelled or dropped task
- **WHEN** a policy cancels or drops a task in the middle of a chain
- **THEN** the chains started after it are counted from zero

### Requirement: The logger itself neither recurses nor loops
The logger SHALL find a cycle with a loop over the chain, not by recursion, so a chain thousands of tasks deep does not overflow the stack of the logger. A report SHALL be made without re-entering the logger: when `onCycle`, the console or a DevTools call emits an event on the same bus, the logger SHALL take the events it gets then as part of its normal input, and SHALL NOT report the same path again or recurse into the report. A cycle that ends in a `RangeError` of the app (the stack of the app is full) SHALL have been reported before it.

#### Scenario: A very deep chain
- **WHEN** a chain of 5 000 tasks, each emitting the next, runs and ends
- **THEN** the logger does not throw and does not overflow the stack

#### Scenario: A report that emits
- **WHEN** `onCycle` emits an event on the same bus, and a handler of that event emits the looping event again
- **THEN** each path is reported once, and the logger does not recurse

#### Scenario: A synchronous loop that overflows the stack
- **WHEN** three handlers loop synchronously until the app throws `RangeError`
- **THEN** the cycle was reported before the error

### Requirement: Re-entry and listener changes during an emit are not mistaken for loops
Subscribing, unsubscribing or replacing a listener while an emit runs SHALL NOT by itself be reported. A listener added during an emit SHALL NOT make the logger count the current emit twice, and a listener that removes itself or another one during the emit SHALL NOT leave counters behind.

#### Scenario: A listener added during an emit
- **WHEN** a handler of `a` subscribes another listener of `a` and does not emit
- **THEN** no cycle is reported

#### Scenario: Removed during an emit
- **WHEN** a handler of `a` removes itself with `off` and emits `b` once
- **THEN** no cycle is reported and the counters of the chain are dropped when the tasks end

### Requirement: A report says where the chain began and how to break it
A cycle or storm report SHALL name the root of the chain (the first node, or `outside` for an emit that came from outside any task), the `traceGroupId` when there is one, and one line of advice chosen by the kind of finding: a self loop (emit a different event for the result), a loop between listeners (break it with a condition or a different event), a storm (`equals` of `useEmitter`, `debounce`, a guard), a runaway chain (look for generated event names). The advice SHALL be text only and SHALL NOT depend on the payload.

#### Scenario: The root is named
- **WHEN** a loop is started by `useEmitter` named `filters` and then runs between two listeners
- **THEN** the report names `filters` as the root and lists the path

#### Scenario: A self loop has its advice
- **WHEN** a handler of `x` emits `x` and the cycle is reported
- **THEN** the report says to emit a different event for the result

### Requirement: A reported path keeps counting
After a path is reported, each further turn of it SHALL be counted without a new report. `cycles()` SHALL give `{ path, repeats, turns, root }` where `turns` is how many times the loop has gone round so far.

#### Scenario: Turns grow, reports do not
- **WHEN** a reported loop runs 500 more turns
- **THEN** `cycles()` shows `turns` of at least 500 for it and no new report was made

### Requirement: A runaway chain is reported by its size
Besides repeats, the logger SHALL count the tasks that one root started, and when that count passes `maxSteps` (default 5000) it SHALL report a runaway chain once for that root, even if every node on it has a different name. The count SHALL be dropped when the root's chain has ended.

#### Scenario: Generated event names
- **WHEN** a handler emits `step/${n + 1}` for each `n` without end
- **THEN** a runaway chain is reported after `maxSteps` tasks, with no repeated node

#### Scenario: A long legitimate chain
- **WHEN** a root starts 4 000 tasks and ends
- **THEN** nothing is reported, and the count is dropped

### Requirement: Cycles that no single chain shows are found in the graph
`cycles()` SHALL also give the strongly connected components of the graph (a node set with a path from each node to every other, or a node that feeds itself), found with an iterative algorithm, so a loop that was seen in pieces over different runs (`a` to `b` in one, `b` to `a` in another) is listed with `source: "graph"`. Such a cycle SHALL NOT be reported through `console.warn` or `onCycle` (it is not a loop that ran), and the exports SHALL mark it as the cycles of a chain.

#### Scenario: Seen in pieces
- **WHEN** one run emits `a` then `b`, and a later separate run emits `b` then `a`
- **THEN** `cycles()` lists the component `a`, `b` with `source: "graph"` and no warning was written

#### Scenario: A deep graph
- **WHEN** the graph is a line of 100 000 nodes
- **THEN** `cycles()` finishes with no stack overflow and returns nothing

### Requirement: Names and exceptions can be set
`graphLogger({ name })` SHALL put `name` before every report line and in the label of the DOT and the JSON exports, so a page with several buses is read at a glance. `graphLogger({ ignore })` SHALL take event or listener names (strings or a predicate) that are left out of the repeat count, the runaway count and the storm count; they stay in the graph.

#### Scenario: A name
- **WHEN** `name: "cart"` is set and a cycle is reported
- **THEN** the line starts with `cart`

#### Scenario: A legitimate recursion
- **WHEN** `ignore: ["tree/visit"]` is set and a handler of `tree/visit` emits `tree/visit` for each child ten levels deep
- **THEN** no cycle is reported, and `tree/visit` is a node with its edge in the graph
