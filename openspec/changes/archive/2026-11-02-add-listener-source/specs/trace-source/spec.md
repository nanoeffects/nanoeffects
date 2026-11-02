# Spec Delta

## Purpose
Lets a reader of a trace or of the console go from the name of a listener to the line of code that registered it, at no cost to a project that does not turn it on.

## ADDED Requirements

### Requirement: tracePlugin can record where a listener was registered
`tracePlugin({ source: true })` SHALL, for each `bus.on` and `bus.once` call on a bus with a tracer, record the location of the call as a string `file:line:column`, taken once at registration. The default SHALL be off, and with it off nothing SHALL be captured. The location SHALL be the first frame outside the plugin's own frames and, when `nanoeffects` is installed under `node_modules`, outside the files of that package. It SHALL NOT be read on emit, and `emit` SHALL do no more work than without the option.

#### Scenario: A named listener
- **WHEN** `bus.on("name/changed", saveName)` is called in `src/user.ts` at line 12, column 5, with `source: true`, and the event is emitted
- **THEN** the `run` events of the listener carry `source` equal to a string that ends with `src/user.ts:12:5`

#### Scenario: Off by default
- **WHEN** the plugin is used with no option
- **THEN** no event has `source` and `new Error` is not called at registration

#### Scenario: Once
- **WHEN** a listener is registered with `bus.once` with the option on
- **THEN** its single run carries the location of the `bus.once` call

### Requirement: Frames of the library are told from the app by the root of the package
The library's frames SHALL be skipped by their number for the plugin's own wrapper, and, only when the plugin's own file URL contains `/node_modules/nanoeffects/`, also by the prefix of that URL up to and including that segment. A folder of the app that is named `nanoeffects` or `dist` SHALL NOT be skipped by its name.

#### Scenario: An app folder with the same name
- **WHEN** the app lives in `/work/nanoeffects/dist/` and the package is installed in `/work/app/node_modules/nanoeffects/`
- **THEN** the source of a listener registered in `/work/nanoeffects/dist/app.js` is that file and line

#### Scenario: A wrapper in the installed package
- **WHEN** the package is installed under `node_modules` and a module registers a listener through `m.on`
- **THEN** the source is the frame of the module's own code, not the wrapper in the package

#### Scenario: A bundle
- **WHEN** the plugin's file URL does not contain `/node_modules/nanoeffects/`
- **THEN** only the fixed frames are skipped, and the first frame after them is the source

### Requirement: An anonymous listener is reported with its source
With `source: true`, a listener with no `traceId` and no function name SHALL be reported as a `run` task whose `type` is the event it handles and whose `source` is the location, so it appears in the trace. A listener on a predicate or an action creator SHALL be reported under its type when it is a string.

#### Scenario: An inline arrow
- **WHEN** `bus.on("name/changed", (name) => {})` is called with the option on and the event is emitted
- **THEN** the trace has a `run` task with type `name/changed` and a `source`

### Requirement: The stack of every engine is read
The location SHALL be read from the stack formats of V8 (`at fn (file:line:col)` and `at file:line:col`), Safari and Firefox (`fn@file:line:col`). When the stack is missing, empty or in a format that is not understood, the listener SHALL have no `source` and registration SHALL NOT throw. The task SHALL still run as it does without the option.

#### Scenario: No stack
- **WHEN** `Error.prototype.stack` is not a string
- **THEN** the listener is registered and runs, and its events have no `source`

#### Scenario: Firefox format
- **WHEN** the first frame outside the library is `saveName@https://app.test/main.js:10:3`
- **THEN** `source` is `https://app.test/main.js:10:3`

### Requirement: consoleLogger can print the source
`consoleLogger({ source: true })` SHALL append ` (file:line:column)` to the line of an event that has `source`, and SHALL print other lines as it does without the option.

#### Scenario: A line with a source
- **WHEN** a listener with a source runs and the logger has `source: true`
- **THEN** its lines end with the location in parentheses

### Requirement: Nothing changes without a tracer or in notrace
On a bus without a tracer, without the plugin, or in the `notrace` build, `source` SHALL be ignored: handlers run as they do without it.

#### Scenario: No tracer
- **WHEN** `tracePlugin({ source: true })` is used on a bus with no tracer
- **THEN** the bus is unchanged
