# scope-context Specification

## Purpose
Lets an action, command, job or module carry its own context fields and bound effects, and lets a single `emit` override them, so a value is pinned to the code that uses it and replaced where a test or a call needs another. It is a plugin: a bus that does not use it pays nothing.

## Requirements

### Requirement: Scopes are switched on by a plugin and cost nothing without it
`bus.use(scopePlugin())` from `nanoeffects/scope` SHALL switch scopes on for that bus and SHALL return the bus typed with no new fields. On a bus without it a scope given to a command, job, action, module or `emit` SHALL be ignored, with no error and no warning, and the task contexts SHALL be those the bus builds without scopes. `createBus` SHALL not import the plugin, and its size SHALL not grow.

#### Scenario: Ignored without the plugin
- **WHEN** a command with `{ cache }` is emitted on a bus without `scopePlugin`
- **THEN** the handler runs, `cache` is not on its context, and nothing is reported

#### Scenario: The core does not grow
- **WHEN** `createBus` is bundled alone before and after the change
- **THEN** the gzip size is the same, and the bundle does not contain the plugin

#### Scenario: Plugin returns the same bus
- **WHEN** `const result = bus.use(scopePlugin())`
- **THEN** `result === bus`

### Requirement: A scope is a flat object of fields and effects
A scope SHALL be a plain object. Every key SHALL be put on the task context as it is, except `$effects`, and except a function made by `effect(fn)`, which SHALL be bound to the task. The name `$effects` is reserved: every entry of that object SHALL be a function whose first parameter accepts `{ signal }`, put on the task context bound to that task: calling `ctx.name(...args)` calls the function with the task context as the first argument.  A key named `effects` SHALL be an ordinary field like any other.

#### Scenario: A context value is read as is
- **WHEN** a command is created with `{ cache }` and its handler destructures `cache`
- **THEN** the handler gets the same `cache` object

#### Scenario: An effect is bound to the task
- **WHEN** a command is created with `{ $effects: { fetchJson } }` and its handler calls `fetchJson(url)`
- **THEN** `fetchJson` runs with the task context as the first argument, so its `signal` is the signal of that task

#### Scenario: A bound effect stops with the task
- **WHEN** the task is aborted while a bound effect waits on `ctx.signal`
- **THEN** the effect sees the abort exactly as the free form `fetchJson(ctx, url)` does

#### Scenario: Unmarked functions are not bound
- **WHEN** the scope is `{ log }` and `log` is a plain function
- **THEN** `ctx.log` is that function, called with the arguments the handler gives

#### Scenario: A key named effects is an ordinary field
- **WHEN** a scope is `{ effects: { retries: 3 } }`
- **THEN** `ctx.effects` is that object, and nothing in it is bound to the task

### Requirement: A scope can be given to an action, a command, a job and a module
`createCommand`, `createJob`, `createAction` and `createModule` (and `createModule` of an app) SHALL accept a scope. The fields of a command, job or action scope SHALL be on the context of every handler that runs for a call made with it, including listeners of its type. The fields of a module scope SHALL be on the context of its listeners, bound commands and background tasks. When a job sends an outcome whose action has a scope of its own, its listeners SHALL see the fields of the job's scope with those of the action's scope over them.

#### Scenario: Command scope reaches its handler and listeners
- **WHEN** `bus.emit(getUser("1"))` runs and `getUser` has `{ cache }`
- **THEN** the handler and every listener of `"user/get"` see `cache`

#### Scenario: Job scope
- **WHEN** a job is created with the scope `{ logger }` as its fourth argument, after `{ success, fail }`
- **THEN** its handler sees those fields, and the `success` / `fail` listeners see them as well

#### Scenario: Action scope
- **WHEN** `bus.emit(userLoaded(user))` runs and `userLoaded` has `{ store }`
- **THEN** every listener of that action gets `store`

#### Scenario: Module scope covers what the module owns
- **WHEN** a module has `{ audit }` and uses `m.on`, `m.handle` and `m.spawn`
- **THEN** each of those handlers and tasks sees `audit`

#### Scenario: Another module does not see it
- **WHEN** a listener is registered outside the module
- **THEN** it does not see the fields of the module scope

#### Scenario: The outcome action's own scope wins over the job's
- **WHEN** a job has the scope `{ logger: jobLogger, trace }` and its `success` action has `{ logger: auditLogger }`, and the job succeeds
- **THEN** the listeners of `success` see `auditLogger` and `trace`, and the handler of the job still sees `jobLogger`

### Requirement: A call can override a scope
`emit` and `ctx.emit` SHALL accept a scope as the second argument when the first one is an action or a command call. It SHALL apply to every task that this emit starts, and to nothing else. The string form `emit("type", payload)` SHALL NOT take a scope.

#### Scenario: A test replaces one field
- **WHEN** `bus.emit(getUser("1"), { http: fakeHttp })` runs
- **THEN** the handler sees `fakeHttp`, and the next plain `bus.emit(getUser("1"))` sees the original `http`

#### Scenario: A call replaces an effect
- **WHEN** `bus.emit(getUser("1"), { $effects: { delay: instantDelay } })` runs
- **THEN** the handler's `delay` is `instantDelay` bound to the task

#### Scenario: Emit from a task
- **WHEN** a handler calls `ctx.emit(userLoaded(user), { context: { store: draft } })`
- **THEN** listeners of that emit see `draft`

#### Scenario: An error does not leave a scope behind
- **WHEN** a listener throws during `emit(call, scope)`
- **THEN** the next `emit` on the bus sees nothing of that scope

### Requirement: Layers have a fixed precedence
For the same field name the value SHALL come from the strongest layer that sets it. `emit` is the strongest, then action / command / job, then module, then bus. Fields of the library (`signal`, `abort`, `emit`, `on`, `off`, `run`, `type`, `payload`) SHALL always win over any layer. A child task SHALL inherit the fields of its parent. `scopePlugin` SHALL give the same result whether it is used before or after `effectsPlugin` and `modulePlugin`.

#### Scenario: Command beats module and bus
- **WHEN** the bus, the module and the command all set `http`
- **THEN** the handler sees the `http` of the command

#### Scenario: Emit beats everything
- **WHEN** the command sets `http` and the call passes `{ http: fake }`
- **THEN** the handler sees `fake`

#### Scenario: Library fields cannot be replaced
- **WHEN** a scope sets `signal` or `emit`
- **THEN** the task context keeps the library's value

#### Scenario: Children inherit
- **WHEN** a handler calls `ctx.run(child)` or an effect such as `retry` makes an attempt
- **THEN** the child context has the same fields as the parent

#### Scenario: A scope beats effectsPlugin in either order
- **WHEN** a scope sets `delay` in `$effects` and the bus has `effectsPlugin({ delay })`, with the two plugins used in either order
- **THEN** the handler of that command sees the `delay` of the scope

### Requirement: Any function with a signal first is an effect
`effectsPlugin` and the `$effects` of a scope SHALL accept any function whose first parameter accepts `{ signal }`, not only `race`, `all`, `allSettled`, `take` and `delay`. The five built-in ones keep their current bound types. A plain function is bound without its first parameter and its generics are erased.

#### Scenario: A user effect is typed without ctx
- **WHEN** `fetchJson` is `(ctx: { signal: AbortSignal }, url: string) => Promise<Json>` and is passed as an effect
- **THEN** the handler sees `fetchJson: (url: string) => Promise<Json>`

#### Scenario: A function without a signal first is rejected
- **WHEN** a function whose first parameter cannot accept `{ signal }` is passed as an effect, or to `effect(…)`
- **THEN** TypeScript reports an error

### Requirement: Generics of a user's effect can be kept
A function typed `Effect<F>` SHALL be bound with the type `F`, generics included. A function made by `effect(fn)` that is a value of a scope SHALL be bound with its own type without the first parameter, generics included.

#### Scenario: Effect type keeps the generic
- **WHEN** `first` is declared `Effect<<T>(items: T[]) => T>` and passed in `$effects`
- **THEN** `ctx.first(["a"])` is typed `string` and `ctx.first([1])` is typed `number`

#### Scenario: effect keeps the generic with no annotation
- **WHEN** `first` is `<T>(ctx: { signal: AbortSignal }, items: T[]) => T` and a scope has `context: { first: effect(first) }`
- **THEN** `ctx.first(["a"])` is typed `string` and `ctx.first([1])` is typed `number`

#### Scenario: A plain generic function is erased
- **WHEN** the same `first`, with no `Effect` type, is an entry of `$effects`
- **THEN** its bound type has `unknown` for `T`, and the documentation names this limit and both ways round it

### Requirement: The fields are typed where they are used
A handler of a command, job or module with a scope SHALL see the scope fields in its context type, merged over the fields of the bus, with no hand-written `WithContext`. A listener of an action with a scope SHALL see them as well. A field set in a scope SHALL replace a field of the same name from the bus in the type. An override in `emit` SHALL be checked against the type of the field it replaces.

#### Scenario: Handler infers the scope
- **WHEN** `createCommand("user/get", (id: string, { cache }) => …, { cache })`
- **THEN** `cache` has the type of the value that was given

#### Scenario: A scope field replaces a bus field in the type
- **WHEN** the bus has `http: Http` and a command scope sets `http: FeedHttp`
- **THEN** the handler's `http` is `FeedHttp`, not an intersection

#### Scenario: A wrong override fails
- **WHEN** `emit(getUser("1"), { cache: 1 })` and `cache` is a `Cache`
- **THEN** TypeScript reports an error

#### Scenario: The string form takes no scope
- **WHEN** `emit("user/get", "1", { cache })` is written
- **THEN** TypeScript reports an error

### Requirement: Scopes do not leak
Nothing a scope puts on a task SHALL keep the task, its context or its signal alive after the task is done. A scope given to one `emit` SHALL not be kept after that emit. Unmounting a module SHALL release its scope and the contexts it made. A bound effect SHALL hold its task context only as long as the context itself lives.

#### Scenario: Contexts are collectable after many tasks
- **WHEN** many commands run with a scope, with `$effects` and with `effect(…)` values, and all finish
- **THEN** their contexts are collected (a `WeakRef` to each is cleared after `global.gc`)

#### Scenario: A per-call scope is not kept
- **WHEN** `emit(call, { big })` returns and its tasks are done
- **THEN** `big` is collectable if nothing else holds it

#### Scenario: Unmount releases the module
- **WHEN** a module with a scope is unmounted
- **THEN** its scope object and the contexts of its tasks are collectable

### Requirement: Scopes keep tasks cheap
A bus without `scopePlugin` SHALL create tasks at the speed it had before this change. A bus with the plugin, for a task that has no scope, SHALL cost no more than the budget recorded in the design. A task with a scope SHALL cost time proportional to the number of its fields, with no work that depends on how many tasks were created before.

#### Scenario: No plugin, no slowdown
- **WHEN** 100 000 tasks are created on a bus without the plugin, before and after the change
- **THEN** the time is the same within the noise of the benchmark

#### Scenario: Plugin without a scope
- **WHEN** the same run uses `scopePlugin()` and no scope
- **THEN** the time is within the recorded budget

#### Scenario: Scope cost does not grow with history
- **WHEN** tasks are created in batches of 10 000 with a scope
- **THEN** the time per batch does not grow from the first batch to the tenth, and memory is stable

### Requirement: Docs show every place a scope can be given
The user documentation SHALL have a runnable, type-checked example for each of: enabling the plugin and its order, command, job, action, module, `emit` override, a user-written effect (in `$effects`, with `Effect<F>`, and with `effect`), and the precedence of the layers. The pages SHALL say that a scope is ignored without the plugin.

#### Scenario: Examples are checked
- **WHEN** `pnpm docs:check` runs
- **THEN** every code block of the scope page type-checks against the source
