## Purpose
Defines `chainOf` and the `chain` option of `consoleLogger`, which show what led to a task, also through listeners that report no event, so an error can be traced back to its cause.

## ADDED Requirements

### Requirement: chainOf returns the causal path of a task
`chainOf(source, id)` SHALL return the path from the root task to the task `id`, oldest first, built from `parentId`. `source` is a recorder, or a plain list of events. With a recorder it SHALL use its events and its remembered tasks, so a task that reported no event (a listener) is a step of the path. With a list it SHALL use only the events. Each step SHALL have `id` and `type`; `effect` and `phase` of the latest event of the task when it has events; `source` and `traceGroupId` when known. The input is not changed.

#### Scenario: A chain through a silent listener
- **WHEN** a listener of `queryChanged` (which reports no event) emits `searchLoaded` with `ctx.emit`, a handler of it fails, and `chainOf(recorder, id)` is called with the id of the failed task
- **THEN** the path lists `queryChanged`, then the failed task, with the listener as a step that has no `phase`

#### Scenario: A chain of three events
- **WHEN** a root `queryChanged` started `searchLoaded`, which started `render`, and `chainOf(events, idOfRender)` is called with a list
- **THEN** it returns the steps `queryChanged`, `searchLoaded`, `render` in that order

#### Scenario: A root
- **WHEN** the task has no `parentId`
- **THEN** the path has that one step

#### Scenario: A parent that is not known
- **WHEN** a `parentId` names a task that a recorder with a `capacity` pushed out, or a list does not have
- **THEN** the path starts at the oldest known task and nothing throws

#### Scenario: An unknown id
- **WHEN** neither the events nor the tasks have the given `id`
- **THEN** the result is an empty list

#### Scenario: The phase is the latest one
- **WHEN** a task has events `start` and `error`
- **THEN** its step has phase `error`

### Requirement: consoleLogger can print the chain of an error
`consoleLogger({ chain: true })` SHALL append the path of the failed task, from the root and with the listeners that report nothing, to the line of an event with phase `error`. Without the option the lines SHALL stay as they are. The option SHALL remember at most the last 1000 tasks.

#### Scenario: An error in a nested task
- **WHEN** a nested task reports `error` with `chain: true`
- **THEN** the line ends with the types of its ancestors and itself, root first

#### Scenario: Off by default
- **WHEN** `consoleLogger()` receives the same error
- **THEN** the line is the same as before this change

#### Scenario: Bounded memory
- **WHEN** more than 1000 tasks are made with `chain: true`
- **THEN** the logger holds at most the last 1000
