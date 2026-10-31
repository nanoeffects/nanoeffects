## MODIFIED Requirements

### Requirement: A scope can be given to an action, a command, a job and a module
`createJob`, `createAction` (also with a handler, which makes it a command) and `createModule` (and `createModule` of an app) SHALL accept a scope. The fields of a command, job or action scope SHALL be on the context of every handler that runs for a call made with it, including listeners of its type. The fields of a module scope SHALL be on the context of its listeners, bound commands and background tasks. When a job sends an outcome whose action has a scope of its own, its listeners SHALL see the fields of the job's scope with those of the action's scope over them.

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

### Requirement: The fields are typed where they are used
A handler of a command, job or module with a scope SHALL see the scope fields in its context type, merged over the fields of the bus, with no hand-written `WithContext`. A listener of an action with a scope SHALL see them as well. A field set in a scope SHALL replace a field of the same name from the bus in the type. An override in `emit` SHALL be checked against the type of the field it replaces.

#### Scenario: Handler infers the scope
- **WHEN** `createAction("user/get", (id: string, { cache }) => …, { cache })`
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
