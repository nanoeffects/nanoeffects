# API server example

A small [Fastify](https://fastify.dev) backend for a front end, over [PokeAPI](https://pokeapi.co). It shows one
thing that a server needs and a browser does not: **when the client leaves, the work stops.** The
server aborts the requests it made for that client, so a closed tab does not keep PokeAPI busy.

You need Node 18 or newer. No database.

```bash
npm install
npm start
```

Then, in another terminal:

```bash
curl localhost:3000/pokemon/pikachu
```

| What you do | What happens | Wrappers |
| ----------- | ------------ | -------- |
| `curl /pokemon/pikachu` | One request for the pokémon, then one per ability. The answer is one JSON object | `timeout`, `retry`, `allSettled` |
| `curl /pokemon/missingno` | PokeAPI answers 404; the server answers 404 and does not try again | `retry` with `shouldRetry` |
| An ability is slow or fails | The answer is still 200, and that ability has `"text": null` | `allSettled`, `timeout` |
| PokeAPI does not answer in time | The server answers 504 | `timeout` |
| Close the connection (`curl -m 0.02 ...`, or leave the page) | The server logs `client left, upstream cancelled`, and every request made for that client is aborted | `signalPlugin` |
| `curl /health` | The number of requests in flight | |
| Press Ctrl+C with a request in flight | The server aborts the request (the client gets a 503), closes the app and exits with 0 | `signalPlugin` |

## How the client leaving stops the work

The route makes one `AbortController` for each response. When the connection closes before the
answer is written, it aborts the controller. (The event is `close` of `reply.raw`: `request.raw`
closes when the request is read, not when the client goes.) The controller's signal goes into
`bus.emit(loadProfile(name), { signal })`, which `signalPlugin` adds to `emit`. The command's
handler passes the signal of its task to every `fetch`, so one abort stops the request for the
pokémon, the retries, and every ability request.

The files, each with one job:

- `src/bus.ts` — the bus, with `signalPlugin`.
- `src/upstream.ts` — the PokeAPI client. `fetch` is a parameter, so a test hands in a fake.
- `src/profile.ts` and `src/profile-handlers.ts` — the command `loadProfile` and its handler:
  `timeout` and `retry` for the pokémon, `allSettled` with a `timeout` for each ability.
- `src/server.ts` — `buildServer`: the Fastify routes, the status of a failure, the disconnect and the shutdown.
- `src/main.ts` — listens on `PORT` (default 3000) and stops on SIGTERM and SIGINT.

PokeAPI is a free service: please keep the requests few, as they are here. The tests of this
example are in `src/tests/backend-examples.test.ts` of the repository: they use a fake upstream and Fastify's `inject`.
The files in this folder are not part of the published package.
