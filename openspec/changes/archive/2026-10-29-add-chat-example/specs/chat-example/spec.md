## Purpose

A chat example shows domains, modules, jobs and cancellable data loading together in an app that every reader knows, with no server to run.

## ADDED Requirements

### Requirement: The chat example runs against a small server
`examples/chat/` SHALL be a React and TypeScript project with a server in `examples/chat/server/` written with Fastify that keeps its data in memory. One command, `npm run dev`, SHALL start the server and the Vite dev server, with `/api` forwarded to the server. Every request the example makes SHALL be a real `fetch` that gets the `AbortSignal` of its task.

#### Scenario: Run it
- **WHEN** a reader installs the example and runs `npm run dev`
- **THEN** the page shows a list of rooms and the history of the selected room, loaded from the server

#### Scenario: An abort reaches the network
- **WHEN** a reader selects a second room while the history of the first is loading
- **THEN** the request of the first is cancelled in the browser, not only ignored

### Requirement: The server misbehaves on a known schedule
The server SHALL answer 503 to every third send, 400 to a send whose text starts with `/fail`, and a search of the room `random` after more than 2 s. New messages SHALL appear on their own. Setting `CHAOS=off` SHALL turn these rules off.

#### Scenario: A busy server is retried
- **WHEN** the server answers 503 to a send
- **THEN** the send is tried again and the message is delivered

#### Scenario: A rejected send is not retried
- **WHEN** a reader sends `/fail hello`
- **THEN** the server answers 400, the message is shown as failed, and it is not tried again

#### Scenario: No instability on request
- **WHEN** the server is started with `CHAOS=off`
- **THEN** no send answers 503 and the search of every room answers quickly

### Requirement: The example splits the logic by domain
The example SHALL have the domains `rooms`, `messages`, `search` and `incoming` as folders. Each folder SHALL have an events file, a handlers file and a module made with `createModule`. The bus file SHALL hold only the bus and its plugins and SHALL NOT import events; an events file SHALL NOT import the bus. One file SHALL mount the modules with `modulePlugin`.

#### Scenario: Layout of a domain
- **WHEN** the folder of a domain is read
- **THEN** it has its events, its handlers and its module, and the events file imports no bus

#### Scenario: Remove a domain
- **WHEN** a module is unmounted
- **THEN** everything it started stops: its listeners, its command bindings and its background task

### Requirement: Loading and sending show cancellation and outcomes
Selecting a room SHALL load its history under `latest`, so a second selection aborts the older load and only the newer result is shown. Sending a message SHALL be a job under `queue` and `retry` (a rejection with a status below 500 is not retried), and the page SHALL show the message at once, then show it as delivered or failed from the outcomes `pending`, `success`, `fail` and `cancel`, not from flags set in the handler. Messages SHALL go out in the order they were sent.

#### Scenario: Switch rooms quickly
- **WHEN** a reader selects a second room while the history of the first is loading
- **THEN** the first load is aborted and only the history of the second room appears

#### Scenario: A failed send
- **WHEN** a send fails after its retries
- **THEN** that message is shown as failed and a later send is not blocked

#### Scenario: Two sends in a row
- **WHEN** a reader sends two messages before the first is delivered
- **THEN** both are shown at once and are delivered in the order they were sent

### Requirement: Search asks every room and shows partial results
Typing in the search box SHALL wait for quiet (`debounce`) and abort the older search when a newer one starts (`latest`). The search SHALL ask every room at once, each request limited by a time (`timeout`), and SHALL wait for all of them to settle (`allSettled`), so a room that is slow or fails does not hide the results of the others. The page SHALL list the messages found and name the rooms that were skipped.

#### Scenario: Results from every room
- **WHEN** a reader searches for a word that appears in two rooms
- **THEN** the messages of both rooms are listed

#### Scenario: A slow room is skipped
- **WHEN** one room answers later than its time limit
- **THEN** the results of the other rooms are shown and that room is named as skipped

#### Scenario: A newer search replaces the older
- **WHEN** a reader changes the query while a search runs
- **THEN** the older search is aborted and only the results of the newer query are shown

### Requirement: Opening a result waits for its room
Opening a search result in a room other than the selected one SHALL select that room, wait until its history has loaded (`take`), and only then mark the message. Opening a result in the selected room SHALL mark the message at once.

#### Scenario: A result in another room
- **WHEN** a reader opens a result that belongs to another room
- **THEN** that room is selected, its history loads, and then the message is marked

#### Scenario: A result in the selected room
- **WHEN** a reader opens a result that belongs to the selected room
- **THEN** the message is marked without a new load

### Requirement: A background task lives with its module
The `incoming` domain SHALL ask the server for new messages at an interval with `poll`, inside a task started with `m.spawn`. It SHALL emit events only while its module is mounted and SHALL stop asking when the module is unmounted. A failed request SHALL NOT stop the polling.

#### Scenario: Unmount stops the stream
- **WHEN** the `incoming` module is unmounted
- **THEN** no further incoming message is emitted

### Requirement: The UI is thin and state changes only through mutations
Components SHALL emit events and read values, and SHALL NOT call the server client `api`. State that a domain keeps SHALL live in a Zustand store of that domain, written only through mutations that the store lists, which its module calls with the data of events, and read by components with `useStore`.

#### Scenario: Components do not call the api
- **WHEN** the files of `examples/chat/` that are components are read
- **THEN** none imports the server client `api`

#### Scenario: A module calls a mutation with data
- **WHEN** a module reacts to the outcome `pending` of a job
- **THEN** it calls a mutation of its store with the payload of the event, and does not set the state itself

### Requirement: The example says that useEventState is not a store
Where a component reads an event into state with `useEventState`, a comment SHALL say that it is not a global store, that an event before the mount is lost, and where a value that must outlive the component belongs.

#### Scenario: The comment is present
- **WHEN** the file that calls `useEventState` is read
- **THEN** it has that comment next to the call

### Requirement: A docs page explains the example
`docs/chat-example.md` SHALL explain the example by the problems it solves (loading that must not race, a send that can fail, a slow room in a search, a poll tied to a module) and SHALL say when to use each piece. It SHALL say how the server misbehaves and how to turn that off, and SHALL link to `docs/actions.md` for the API. The page SHALL be linked from `llms.txt`, `docs/actions.md`, `docs/starter.md` and `examples/README.md`, and every code block of it SHALL pass `pnpm docs:check`.

#### Scenario: The page is indexed
- **WHEN** `docs/chat-example.md` exists and `llms.txt` links it
- **THEN** `pnpm llms:check` passes

### Requirement: The example passes the project gates
`examples/chat/` SHALL pass `pnpm tsgo` and `pnpm check` with the type check using the sources of `nanoeffects`, SHALL NOT be part of the published package, and SHALL NOT change anything in `src/`. Its server SHALL pass `pnpm check`.

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes with the example in the repository
