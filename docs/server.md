# Stop work on a server when the client leaves

Read this page if you run a Node server (the examples use [Fastify](https://fastify.dev)) and want the work for a request, a socket or a queued job to stop when nobody needs it. It shows one pattern in three places: a request, a WebSocket and a worker.

You need Node 18 or newer, `fastify` and `nanoeffects`. `api` below is your own client for another service: replace it with your requests.

## Why a server needs this

A browser tab that closes stops its own requests. A server does not: if a client leaves, the requests that the server made for it keep running, and so do their retries. On a busy server that is wasted work and a slower service for everyone else.

The fix is one `AbortController` for each unit of work that the client owns, and one rule: **when the client goes, abort the controller.** `signalPlugin` lets `bus.emit` take that signal, so `timeout`, `retry` and the request itself stop.

| Unit of work | Created when | Aborted when |
| ------------ | ------------ | ------------ |
| An HTTP request | the route starts | the connection closes before the answer |
| A WebSocket | the socket connects | the socket closes |
| A queued job | the job is accepted | the server shuts down |

## Make the bus and the command

The bus and the command live in files that know nothing about HTTP, so the same command can run in a route, a test or a worker.

```js
// bus.js
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// createBus — the bus the server shares
// signalPlugin — lets emit take { signal }, so a closed connection can abort the work
export const bus = createBus().use(signalPlugin());
```

The command loads a user. It tries the request up to three times, and gives up on each try after five seconds. `ctx.signal` is the signal of the task: it aborts when the controller of the request aborts.

```js
// user.js
import { createCommand } from "nanoeffects/actions";
import { retry, timeout } from "nanoeffects/effects";

// createCommand — a command with a handler: emit returns what the handler returns
export const getUser = createCommand("user/get", async (id, ctx) => {
  // one try: the request, with the signal of timeout so it can stop it
  const load = ({ signal }) => api.getUser(id, { signal });
  // timeout — fail the try after 5 s
  const attempt = () => timeout(ctx, 5000, load);
  // retry — up to 3 tries, 500 ms apart
  return retry(ctx, attempt, { times: 3, delay: 500 });
});
```

## Stop the work of a request

<!-- docs-check: continue -->

Make a controller when the route starts. Listen to `close` of the **response** (`reply.raw`): it ends when the connection ends. `request.raw` also emits `close`, but it does so when the request body has been read, not when the client leaves, so it is the wrong event here.

```js
// server.js
import Fastify from "fastify";
import { bus } from "./bus";
import { getUser } from "./user";

export const app = Fastify();

// the controllers of the requests that are still being answered, for the shutdown below
export const inFlight = new Set();

app.get("/users/:id", async (request, reply) => {
  const controller = new AbortController();
  inFlight.add(controller);

  // close on the response — the connection ended; if the answer was not finished, the client left
  reply.raw.on("close", () => {
    inFlight.delete(controller);
    if (!reply.raw.writableFinished) {
      controller.abort();
    }
  });

  try {
    // emit with { signal } — aborting the controller aborts the command: timeout, retry and the request
    const call = getUser(request.params.id);
    return await bus.emit(call, { signal: controller.signal });
  } catch (error) {
    // nobody is left to answer when the client closed the connection
    if (reply.raw.destroyed) {
      return reply;
    }
    return reply.code(502).send({ error: String(error) });
  }
});
```

After an abort the command rejects with the abort reason. The `catch` above ignores it when the connection is gone, because there is nobody to answer.

## Stop the server

<!-- docs-check: continue -->

Keep the controllers of the requests in flight in a set. On SIGTERM (what a container sends) or SIGINT (Ctrl+C), abort them all, then close the app. A request that is aborted this way answers with an error, and `app.close()` waits for the connections to end.

```js
// shutdown.js
import { app, inFlight } from "./server";

// SIGTERM is what a container sends, SIGINT is Ctrl+C
for (const name of ["SIGTERM", "SIGINT"]) {
  process.on(name, async () => {
    for (const controller of inFlight) {
      controller.abort();
    }
    await app.close();
    process.exit(0);
  });
}
```

The route above fills `inFlight` and empties it in the `close` listener. The [api-server example](../examples/api-server) does the same, with a limit of two seconds for the close.

## Tie a WebSocket to its work

<!-- docs-check: continue -->

A socket lasts minutes and carries several tasks (a subscription, a heartbeat), so the controller belongs to the socket and every `emit` for it gets the same signal. Closing the socket stops all of them.

First the command. It sends a price now and then every second, until its task is aborted.

```js
// prices.js
import { createCommand } from "nanoeffects/actions";
import { poll } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

// createCommand — a command with a handler
// latest — a new subscription stops the old one; key — but only the old one of the same socket
export const watchPrices = createCommand(
  "prices/watch",
  latest(
    async (call, ctx) => {
      // poll — call the function now and every second, until the task is aborted
      await poll(ctx, () => call.send(`${call.symbol}: ${Math.random()}`), 1000, {
        leading: true,
      });
    },
    { key: (call) => call.socketId },
  ),
);
```

Without the `key`, one policy serves the whole command, and a new subscription on one socket would stop the subscription on another.

Then the route. Each socket gets an id and a controller.

```js
// sockets.js
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { bus } from "./bus";
import { watchPrices } from "./prices";

const sockets = Fastify();
sockets.register(websocket);

let lastSocketId = 0;

sockets.register(async (instance) => {
  instance.get("/prices", { websocket: true }, (socket) => {
    lastSocketId += 1;
    const socketId = lastSocketId;
    const controller = new AbortController();
    const { signal } = controller;

    // close — the client left: stop everything started for this socket
    socket.on("close", () => controller.abort());

    socket.on("message", (data) => {
      const send = (text) => socket.send(text);
      const call = watchPrices({ socketId, symbol: String(data), send });
      // emit with { signal } — the call stops when the socket closes
      bus.emit(call, { signal });
    });
  });
});
```

The [ws-server example](../examples/ws-server) adds a close for a silent socket, made of `race`, `take` and `delay`.

## Run a queue worker

A worker takes jobs from a client and answers at once, and the work goes on in the background. Use `createJob` with `queue` to limit how many run together, `retry` and `timeout` to give up, and the outcomes of the job (`pending`, `success`, `fail`, `cancel`) to count them. Give every `emit` of the job the same signal; aborting it at shutdown cancels the jobs that are left.

One detail matters: a call that is still waiting in the queue when the signal aborts never starts, and the job sends no outcome for it. Count such calls yourself if you need the totals to add up.

The [job-worker example](../examples/job-worker) has all of it: the counts, `GET /stats`, and a shutdown in three steps (stop taking jobs, wait, abort the rest).

## Examples

| Folder | What it shows |
| ------ | ------------- |
| [`api-server`](../examples/api-server) | A Fastify server over PokeAPI: `timeout`, `retry`, `allSettled`, and the abort when the client leaves |
| [`ws-server`](../examples/ws-server) | A WebSocket server: one controller for each socket, `latest` with a `key`, an idle close |
| [`job-worker`](../examples/job-worker) | A queue worker: `queue`, `retry`, `timeout`, counts from the outcomes, a three-step shutdown |
