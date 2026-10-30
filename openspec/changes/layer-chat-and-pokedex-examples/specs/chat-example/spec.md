## RENAMED Requirements

- FROM: `### Requirement: The example splits the logic by domain`
- TO: `### Requirement: The example splits the logic by layers`

## MODIFIED Requirements

### Requirement: The example splits the logic by layers
The example SHALL have the entities `room` and `message` and the features `show-history`, `receive-messages` and `search-messages` as folders, over a `shared` folder with the bus and the server client, as `example-layers` says. Each entity and feature folder SHALL have an events file, a handlers file and a module made with `createModule`. The bus file SHALL hold only the bus and its plugins and SHALL NOT import events; an events file SHALL NOT import the bus. One file SHALL mount the modules with `modulePlugin`.

#### Scenario: Layout of a domain
- **WHEN** the folder of an entity or a feature is read
- **THEN** it has its events, its handlers and its module, and the events file imports no bus

#### Scenario: Remove a domain
- **WHEN** a module is unmounted
- **THEN** everything it started stops: its listeners, its command bindings and its background task

### Requirement: A background task lives with its module
The `receive-messages` feature SHALL ask the server for new messages at an interval with `poll`, inside a task started with `m.spawn`. It SHALL emit events only while its module is mounted and SHALL stop asking when the module is unmounted. A failed request SHALL NOT stop the polling.

#### Scenario: Unmount stops the stream
- **WHEN** the `receive-messages` module is unmounted
- **THEN** no further incoming message is emitted

### Requirement: The UI is thin and state changes only through mutations
Components SHALL emit events and read values, and SHALL NOT call the server client `api`. State that an entity or a feature keeps SHALL live in a Zustand store of that entity or feature, written only through mutations that the store lists, which its module calls with the data of events, and read by components with `useStore`.

#### Scenario: Components do not call the api
- **WHEN** the files of `examples/chat/` that are components are read
- **THEN** none imports the server client `api`

#### Scenario: A module calls a mutation with data
- **WHEN** a module reacts to the outcome `pending` of a job
- **THEN** it calls a mutation of its store with the payload of the event, and does not set the state itself
