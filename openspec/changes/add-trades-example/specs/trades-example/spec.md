## Purpose

A live list of trades over a WebSocket shows how a long-lived connection fits a task: it ends on abort, starts again after a drop, and feeds the screen through the bus.

## ADDED Requirements

### Requirement: The connection is one task
`examples/trades/` SHALL be a React and TypeScript project that starts with `npm run dev` and needs no server of its own. The connection to the stream SHALL be one command that carries its handler, and the socket SHALL be closed when the task is aborted.

#### Scenario: Run it
- **WHEN** a reader installs the example and runs `npm run dev`
- **THEN** the page shows the status of the connection and a list of trades that grows while the stream sends

#### Scenario: Another pair
- **WHEN** a reader picks another trading pair
- **THEN** the old socket is closed, a new one is opened, and the list holds only trades of the new pair

### Requirement: A drop opens the connection again
When the socket closes without an abort, the command SHALL open it again after a pause that grows up to a limit, with no limit of attempts, and the status SHALL show that it is reconnecting.

#### Scenario: Network off
- **WHEN** the network is switched off and on again
- **THEN** the status shows reconnecting and then live, and trades arrive again without a reload

### Requirement: The bus gets every trade and the screen is limited
Every message of the stream SHALL be emitted on the bus as an action. The component SHALL rebuild the list at a limited rate (`throttle`), so a fast stream does not render on every message.

#### Scenario: Fast stream
- **WHEN** the stream sends many trades in a second
- **THEN** the list is rebuilt a few times in that second, and no trade is lost from the bus

### Requirement: The example passes the project gates
`examples/trades/` SHALL pass `pnpm tsgo` and `pnpm check`, SHALL NOT be part of the published package, and SHALL NOT change anything in `src/`.

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes with the example in the repository
