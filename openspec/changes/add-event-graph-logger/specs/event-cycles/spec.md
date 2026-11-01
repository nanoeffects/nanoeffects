## ADDED Requirements

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
