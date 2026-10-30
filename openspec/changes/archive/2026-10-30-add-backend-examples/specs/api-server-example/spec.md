## ADDED Requirements

### Requirement: The api-server example is a small server over PokeAPI
`examples/api-server/` SHALL be a TypeScript project that starts with `npm start`, is a Fastify app that uses only `fastify` and `nanoeffects`, and has no database. `GET /pokemon/:name` SHALL answer JSON with the name, the types and the abilities of the pokémon, each ability with its description or `null`. Every upstream request SHALL be a `fetch` to `pokeapi.co` that gets the `AbortSignal` of its task.

#### Scenario: Run it
- **WHEN** a reader runs `npm start` and requests `/pokemon/pikachu`
- **THEN** the answer is 200 with `name`, `types` and `abilities`

#### Scenario: A partial answer
- **WHEN** one ability request fails or takes longer than its limit
- **THEN** the answer is still 200 and that ability has `text: null`

### Requirement: Failures map to statuses and are limited and retried
The profile SHALL be built by one command that carries its handler. The request for the pokémon SHALL be limited in time (`timeout`) and tried again after a failure that is not an answer (`retry` with `shouldRetry`), and a status below 500 SHALL NOT be retried. A 404 from PokeAPI SHALL answer 404, a timeout SHALL answer 504, and any other failure SHALL answer 502, each with a JSON body that has an `error` text.

#### Scenario: An unknown name
- **WHEN** PokeAPI answers 404 for the name
- **THEN** the server answers 404 and the request is not tried again

#### Scenario: A failure that passes
- **WHEN** the request for the pokémon fails twice and then answers
- **THEN** the server answers 200

#### Scenario: A request that does not answer
- **WHEN** the request for the pokémon takes longer than the limit
- **THEN** the server answers 504

### Requirement: A client that leaves stops the upstream work
The route SHALL abort an `AbortController` when the connection closes before the response has finished (the `close` of the raw response, not of the request), and SHALL run the command with `bus.emit(call, { signal })` through `signalPlugin`, so every upstream request of that response receives an aborted signal. It SHALL log that the client left and the upstream calls were cancelled, and SHALL NOT write a response to the closed connection.

#### Scenario: The client disconnects
- **WHEN** a client closes the connection while the server waits for PokeAPI
- **THEN** the signal of the upstream request is aborted, and the server starts no further request for that response

### Requirement: The server reports its load and stops cleanly
`GET /health` SHALL answer 200 with the number of requests in flight. On SIGTERM or SIGINT the server SHALL abort the requests in flight (each answers 503), SHALL close the app, which stops listening, and SHALL exit with code 0 once that has ended or after 2 seconds.

#### Scenario: Health
- **WHEN** two requests are in flight and a client asks `/health`
- **THEN** the answer says that 2 requests are in flight

#### Scenario: Shutdown
- **WHEN** the process receives SIGTERM while a request is in flight
- **THEN** the server accepts no new connection, the request in flight is aborted, and the process exits with 0

### Requirement: The example is tested and passes the project gates
`src/tests/backend-examples.test.ts` SHALL run the app against a fake upstream and cover the answers above, the retry, the limits and the disconnect. `examples/api-server/` SHALL pass `pnpm tsgo` and `pnpm check` with the type check using the sources of `nanoeffects`, SHALL NOT be part of the published package, SHALL NOT change anything in `src/`, and SHALL add no dependency to the published package (its dev dependencies are `fastify`, `@fastify/websocket` and `@types/ws` in the root `package.json`).

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes with the example and its tests in the repository
