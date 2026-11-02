## MODIFIED Requirements

### Requirement: An anonymous listener is reported with its source
With `source: true`, a listener with no `traceId` and no function name SHALL be reported as a `run` task whose `source` is the location and whose `type` is the event it handles followed by `#` and a number, `event#2`, so each such listener is a distinct task in the trace and a distinct node in a graph. The number SHALL count the unnamed listeners registered for that event on that bus, from 1, in the order of registration, and SHALL NOT be reused when a listener is removed. It SHALL NOT depend on the line of the call. When the event is not a string (a predicate), the listener SHALL be reported as it is without this requirement. A listener on a predicate or an action creator SHALL be reported under its type when it is a string. A listener with a `traceId` or a function name SHALL keep that name. Without `source: true` an anonymous listener SHALL be reported as it is without the option.

#### Scenario: An inline arrow
- **WHEN** `bus.on("name/changed", (name) => {})` is called in `src/user.ts` at line 12, column 5, with the option on and the event is emitted
- **THEN** the trace has a `run` task with type `name/changed#1` and a `source` that ends with `src/user.ts:12:5`

#### Scenario: Two inline listeners on one event
- **WHEN** two inline arrows are registered on `cart/added` at different lines with the option on
- **THEN** the trace and the graph have two tasks and two nodes, `cart/added#1` and `cart/added#2`

#### Scenario: A line moves
- **WHEN** the same two listeners are registered after other lines are added above them
- **THEN** the names are still `cart/added#1` and `cart/added#2`

#### Scenario: A listener is removed
- **WHEN** `cart/added#1` is removed and another inline listener is registered on `cart/added`
- **THEN** the new one is `cart/added#3`

#### Scenario: A named listener keeps its name
- **WHEN** `bus.on("name/changed", saveName)` or `bus.on("name/changed", fn, { traceId: "saveNotifier" })` is called with the option on
- **THEN** the task is named `saveName` or `saveNotifier`, and carries its `source`

#### Scenario: No stack
- **WHEN** the stack is missing or not understood and the listener is an inline arrow
- **THEN** the task is still named `event#1`, has no `source`, and registration does not throw

#### Scenario: Option off
- **WHEN** `bus.on("name/changed", (name) => {})` is called without `source: true`
- **THEN** the listener is not renamed and the trace shows what it showed before
