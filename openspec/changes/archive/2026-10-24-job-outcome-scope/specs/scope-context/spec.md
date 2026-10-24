## MODIFIED Requirements

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
