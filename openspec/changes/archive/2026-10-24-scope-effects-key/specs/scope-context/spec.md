## MODIFIED Requirements

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

### Requirement: Docs show every place a scope can be given
The user documentation SHALL have a runnable, type-checked example for each of: enabling the plugin and its order, command, job, action, module, `emit` override, a user-written effect (in `$effects`, with `Effect<F>`, and with `effect`), and the precedence of the layers. The pages SHALL say that a scope is ignored without the plugin.

#### Scenario: Examples are checked
- **WHEN** `pnpm docs:check` runs
- **THEN** every code block of the scope page type-checks against the source
