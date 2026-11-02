# Spec Delta

## MODIFIED Requirements

### Requirement: tracePlugin can record where a listener was registered
`tracePlugin({ source: true })` SHALL, for each `bus.on` and `bus.once` call on a bus with a tracer, record the location of the call as a string `file:line:column`, taken once at registration. The default SHALL be off, and with it off nothing SHALL be captured. The location SHALL be the code that called the outermost method of the bus that the call went through. It SHALL NOT be read on emit, and `emit` SHALL do no more work than without the option.

#### Scenario: A named listener
- **WHEN** `bus.on("name/changed", saveName)` is called in `src/user.ts` at line 12, column 5, with `source: true`, and the event is emitted
- **THEN** the `run` events of the listener carry `source` equal to a string that ends with `src/user.ts:12:5`

#### Scenario: Off by default
- **WHEN** the plugin is used with no option
- **THEN** no event has `source` and `new Error` is not called at registration

#### Scenario: Once
- **WHEN** a listener is registered with `bus.once` with the option on
- **THEN** its single run carries the location of the `bus.once` call

## REMOVED Requirements

### Requirement: Frames of the library are told from the app by the root of the package
**Reason**: The path of the package is not known in a bundle or in a dev server, and a wrapper of the library then showed as the source. A caller slot gives the user's frame without looking at file names.
**Migration**: See "A registration through a wrapper has the source of its caller".

## ADDED Requirements

### Requirement: A registration through a wrapper has the source of its caller
A method that wraps `on` or `once` (the plugins `matchPlugin`, `signalPlugin` and `devPlugin`, the `on` of a module, and the `on` and `once` of an instance made by `extendBus`) SHALL call `withCaller` directly in its body. The outermost such method SHALL read the stack once and hold it for the synchronous time of the call, and every wrapper below it SHALL leave it as it is. `tracePlugin` SHALL use the held stack, or read one itself when no wrapper held it, and in both cases SHALL skip exactly the two frames of the helper and of the method that called it. The result SHALL NOT depend on the order in which plugins were used, on file names or on whether the library is bundled.

#### Scenario: Every order of plugins
- **WHEN** a listener is registered with `bus.on` in a test file, in any order of `tracePlugin` and the plugins that wrap `on`
- **THEN** its `source` ends with that test file and its line

#### Scenario: A module
- **WHEN** a module registers a listener with `m.on` in its `setup`
- **THEN** the `source` is the line of that `m.on` call in the module, not a line of the library

#### Scenario: An instance
- **WHEN** an instance made by `extendBus` calls `this.on(event, handler)`
- **THEN** the `source` is the line of that call

#### Scenario: A bundle
- **WHEN** the library and the app are one file
- **THEN** the `source` is still the line of the call in the app code

### Requirement: A deferred registration keeps the source of the call that made it
`modulePlugin` holds the `on` and `once` calls made before its app starts and replays them later. The held call SHALL save the stack at the moment the user called, and the replay SHALL give that stack to `withCaller` as the saved stack, so the source of the listener is the line of the user's call, not the line of the replay.

#### Scenario: A listener registered before the app starts
- **WHEN** `bus.on` is called in `src/boot.ts` before the first use of the app, and the app replays it
- **THEN** the `source` of the listener is the line in `src/boot.ts`

### Requirement: The slot is safe
The slot SHALL be set only when `tracePlugin({ source: true })` asked for a caller, SHALL be reset in a `finally` also when the call throws, and SHALL be empty again when the outermost call returns. A registration made inside a handler SHALL get its own caller, and a registration that is not wrapped SHALL NOT take a stack that another call left. With the option off, `withCaller` SHALL read no stack and add no more than a check and the call.

#### Scenario: A throwing registration
- **WHEN** the method below the outermost wrapper throws
- **THEN** the slot is empty after it, and the next registration has its own source

#### Scenario: Option off
- **WHEN** no bus asked for a caller
- **THEN** `withCaller(call)` returns the result of `call()` and `new Error` is not called

### Requirement: ctx.on called by hand is not covered
`ctx.on` of a handler lives in `src/core`, and `createBus` SHALL NOT import the helper. A listener registered with `ctx.on` called by hand SHALL have the frame of `ctx.on` as its source or none, and SHALL still run as it does without the option. The `on` of a module, which goes through `ctx.on`, SHALL be covered by the wrapper above it.

#### Scenario: ctx.on in a handler
- **WHEN** a handler calls `ctx.on(event, handler)` with the option on
- **THEN** the listener is registered and runs, and its `source` may be the frame of `ctx.on`
