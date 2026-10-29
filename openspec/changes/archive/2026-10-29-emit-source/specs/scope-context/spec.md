# Spec Delta

## MODIFIED Requirements

### Requirement: A scope is a flat object of fields and effects
A scope SHALL be a plain object. Every key SHALL be put on the task context as it is, except `$effects`, and except a function made by `effect(fn)`, which SHALL be bound to the task. The name `$effects` is reserved: every entry of that object SHALL be a function whose first parameter accepts `{ signal }`, put on the task context bound to that task: calling `ctx.name(...args)` calls the function with the task context as the first argument.  A key named `effects` SHALL be an ordinary field like any other. The name `traceGroupId` is reserved for the tracer: it SHALL NOT be put on the task context (see `trace-group`).

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


#### Scenario: traceGroupId is not a context field
- **WHEN** a scope is `{ traceGroupId: "checkout", cache }`
- **THEN** `ctx.cache` is the cache, `ctx.traceGroupId` is `undefined`, and the tracer reads the `traceGroupId`

