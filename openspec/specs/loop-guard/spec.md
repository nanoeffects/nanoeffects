# loop-guard Specification

## Purpose
TBD - created by archiving change add-event-graph-logger. Update Purpose after archive.

## Requirements

### Requirement: loopGuardPlugin is an opt-in plugin of the bus
`loopGuardPlugin(options?)` from `nanoeffects/guard` SHALL be a plugin: `bus.use(loopGuardPlugin(options))` returns the same bus. It SHALL need no tracer and no `tracePlugin`, SHALL work in any order with the other plugins, and a bus that does not use it SHALL behave as before. With no limit reached it SHALL change nothing a handler or a caller can observe.

#### Scenario: Not used
- **WHEN** a bus does not use the plugin and a loop runs
- **THEN** it behaves as before

#### Scenario: Used, no limit reached
- **WHEN** a chain stays under every limit
- **THEN** the handlers run, in the same order and with the same results, as without the plugin

#### Scenario: Without a tracer
- **WHEN** the bus has no `trace`
- **THEN** the plugin works

#### Scenario: Any order
- **WHEN** the plugin is used before or after `tracePlugin`, `scopePlugin`, `signalPlugin`, `contextPlugin`, `actionsPlugin` or `modulePlugin`
- **THEN** a loop is cut the same way in each order

### Requirement: A node that repeats too often in a chain is cut
The plugin SHALL count how many times the same event type appears in the chain of emits that led to an emit, and SHALL refuse the emit that would make the count pass `maxRepeats` (default 50). The chain SHALL cross asynchronous gaps, so a loop through `await`, a timer or a microtask is cut too.

#### Scenario: A synchronous loop
- **WHEN** a handler of `a` emits `b`, a handler of `b` emits `a`, and `maxRepeats` is 50
- **THEN** the chain stops after `a` has run 50 times, and no `RangeError` happens

#### Scenario: A loop made of microtasks
- **WHEN** a handler of `a` awaits `Promise.resolve()` and emits `a`, with no end
- **THEN** the loop stops after `maxRepeats`, and the page is not frozen

#### Scenario: A loop across timers
- **WHEN** the handler of `a` emits `a` from a `setTimeout` of 0, with fake timers
- **THEN** the loop stops after `maxRepeats` runs

#### Scenario: Below the limit
- **WHEN** a legitimate chain repeats an event 10 times with `maxRepeats` of 50
- **THEN** every emit goes through

### Requirement: A chain that is too deep is cut
The plugin SHALL refuse an emit that would make the chain longer than `maxDepth` (default 1000), whatever the names are, so a loop of generated event names is cut too.

#### Scenario: Generated names
- **WHEN** a handler emits `step/${n + 1}` without end
- **THEN** the chain stops at `maxDepth`

#### Scenario: A deep walk that is legitimate
- **WHEN** a chain of 300 different events runs with the default limits
- **THEN** it runs to the end

### Requirement: What happens at the limit is chosen, and always reported
At a limit the plugin SHALL do what `onLimit` says: `"drop"` (the default) SHALL leave the refused emit unsent, so no handler of it runs and the emit returns as if nobody listened; `"throw"` SHALL throw a `LoopError` from the emit that was refused. In both cases the plugin SHALL report the finding once for each path through `report` (default: `console.error` with the path), and the report SHALL NOT contain the payload. An error thrown by `report` SHALL NOT break the emit.

#### Scenario: Drop
- **WHEN** the limit is reached with `onLimit: "drop"`
- **THEN** the refused emit runs no handler, does not throw, and one report is made

#### Scenario: Throw
- **WHEN** the limit is reached with `onLimit: "throw"`
- **THEN** the emit throws a `LoopError` that names the path and the limit

#### Scenario: One report for a path
- **WHEN** the same loop is refused 1 000 times
- **THEN** it is reported once

#### Scenario: A throwing report
- **WHEN** `report` throws
- **THEN** the emit still returns or throws as `onLimit` says, and no other error is raised

### Requirement: Only the looping chain is cut
A refused emit SHALL NOT abort, change or delay any other task. Chains with other roots SHALL go on, and a new root emit of the same event after the cut SHALL start a fresh chain with its counts at zero.

#### Scenario: Another chain at the same time
- **WHEN** one chain is cut while an unrelated chain is running
- **THEN** the unrelated chain finishes normally

#### Scenario: Afterwards
- **WHEN** a loop was cut and then `bus.emit("a")` is called from outside
- **THEN** the new chain starts with its counts at zero

### Requirement: Events that nothing in the chain emitted can be rate-limited
With `maxPerSecond` set, the plugin SHALL count the emits that come from outside any task for each event type, and SHALL refuse those over the limit in a second, with the same `onLimit` and report. Without the option nothing SHALL be counted.

#### Scenario: A component that emits on every render
- **WHEN** `maxPerSecond: 100` is set and a component emits `filters/changed` 500 times in one second
- **THEN** the first 100 go through, the rest are refused, and one report is made

#### Scenario: Off by default
- **WHEN** `maxPerSecond` is not set
- **THEN** no outside emit is refused

### Requirement: Some names can be left out
`ignore` SHALL take event names (strings or a predicate) that the repeat count skips; `maxDepth` SHALL still apply to them.

#### Scenario: A recursion that is legitimate
- **WHEN** `ignore: ["tree/visit"]` is set and `tree/visit` repeats 200 times down a tree
- **THEN** every emit goes through

### Requirement: The cost is small and bounded
The plugin SHALL keep for each live task context one small record (its event type, its parent record and its depth), SHALL make no other allocation per emit while the chain is under the limits, and SHALL drop a record with its context. The check SHALL read at most `maxDepth` records of a chain.

#### Scenario: No growth
- **WHEN** 100 000 short chains run one after another
- **THEN** the plugin holds no record of a finished chain

#### Scenario: A fast path
- **WHEN** a chain is shallower than `maxRepeats`
- **THEN** no walk over the chain is made
