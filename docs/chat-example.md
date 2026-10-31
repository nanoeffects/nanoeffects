# Build a chat with entities, features, modules and a small server

Use this page when your app has several features that react to each other and you want to see where each piece of logic goes. The example is a chat with rooms, a history that loads, messages that can fail to send, a search across all rooms, and new messages that arrive on their own. A small Fastify server in the example answers every request, and it misbehaves on a known schedule, so each problem on this page really happens.

It is a level D example. Start with [Actions, jobs and modules](actions.md) for the API, or with the `domains-ts` template in [Start a project from a template](starter.md#start-with-domains) for a smaller project.

The code is in [`examples/chat`](../examples/chat). Run it on [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/chat), or on your machine:

```bash
cd examples/chat
npm install
npm run dev
```

`npm run dev` starts the server and Vite together. Start it with `CHAOS=off npm run dev` to turn the failures off.

## Read how the server fails

The server keeps its data in memory. These rules are on purpose, and they are the same every run, so you can follow each section below by doing what the table says:

| What you do | What the server does | Section |
| ----------- | -------------------- | ------- |
| Select a room, then another before the first is shown | The room Random loads its history in 1.2 s, slower than the others. | [Load a history that must not race](#load-a-history-that-must-not-race) |
| Send messages | Every third send answers 503. | [Send a message that can fail](#send-a-message-that-can-fail) |
| Send `/fail hello` | Answers 400. | [Send a message that can fail](#send-a-message-that-can-fail) |
| Search a word that is in Random | Random answers after 2.5 s. | [Search where one room is slow](#search-where-one-room-is-slow) |
| Wait | A new message appears every 4 s. | [Poll for new messages](#poll-for-new-messages) |

Open the Network panel of the browser while you do this. A request that the page aborts shows as cancelled there, and the server prints `aborted: ...` for it.

## See how the files are split

The code is in layers, and a file imports only from the layers below it. The components only emit events and read values; they never call the server.

| Path | Layer | Job |
| ---- | ----- | --- |
| `src/shared/bus.ts` | shared | Creates the bus. It imports no events, no entity and no feature. |
| `src/shared/api.ts` | shared | The client of the server: one function per request. |
| `src/entities/room/` | entity | The list of rooms and the selected room. |
| `src/entities/message/` | entity | The history of the open room, sending a message, and a message that arrives. |
| `src/features/show-history/` | feature | A selected room loads its history. |
| `src/features/search-messages/` | feature | Searching every room and opening a result. |
| `src/features/receive-messages/` | feature | New messages, asked for at an interval. |
| `src/ui/`, `src/app.ts` | top | The components, and the file that mounts the modules. |
| `server/` | | The Fastify server and the script that starts it with Vite. |

**The rule.** An entity is a thing with its own state and orders (a room, a message). It imports `shared` and nothing else. A feature is a scenario that connects things: it imports `shared` and entities, and never another feature. The top imports anything below. No two entities import each other and no two features import each other, and a test in the repository (`src/tests/architecture.test.ts`) fails when one does.

That rule is why `show-history` exists. Selecting a room must load its history, but `room` does not know `message` and `message` does not know `room`. The feature `show-history` is the one place that knows both: it listens to `rooms/selected` and starts the job `messages/loadHistory`. The same goes for a message that arrives: `receive-messages` emits `incoming/received`, an event that the `message` entity owns and listens to.

A folder has its events (`room.ts`, which imports no bus), its work (`room-handlers.ts`), the state it keeps (`room-store.ts`) and a module (`room-module.ts`) that wires them. Another layer reaches an entity through its actions, never through its handlers or its store. All actions live in the events file. An action with no handler says that something happened, and any feature may listen: `rooms/selected` is heard by two. An action with a handler is an order with exactly one handler, as `search/openResult` and `messages/mark` are. The handler is given to `createAction`, so the action works wherever it is called and can return a result, and the module binds it with `module.use` for as long as it is mounted. A job is an action with a handler that also sends its outcomes, but its handler is bound in the module (`module.handle`): a job usually runs under a policy, and the type of its outcomes is exact only when the handler is not part of the type.

The layers come from [Feature-Sliced Design](https://feature-sliced.design/), reduced to the three that an app of this size needs.

## Load a history that must not race

**Problem.** The reader clicks a slow room and then a fast one. If the slow answer arrives last, it shows the wrong room, and a hand-written loading flag stays `true` when a request is aborted.

**When.** A load starts from a user choice that can change before it ends.

A job sends `pending` when its handler starts and exactly one of `success`, `fail` and `cancel` when it ends. `latest` around the handler aborts the older load when a newer one starts, so only the newer result is delivered, and the older one sends `cancel`:

```js
// message.js
import { createJob } from "nanoeffects/actions";

// createJob — an action with a handler that also sends pending, success, fail and cancel
export const loadHistory = createJob("messages/loadHistory");
```

```js
// message-handlers.js
import { latest } from "nanoeffects/policies";

// latest — a load for a newer room aborts the older one, and its result is never delivered
export const fetchHistory = latest((roomId, { signal }) => api.loadHistory(roomId, { signal }));
```

The module gives the job its work and keeps the state from the outcomes, so an aborted load clears the flag too (see [Show a loading state with a job](actions.md#show-a-loading-state-with-a-job)):

```js
// message-module.js
import { createModule } from "nanoeffects/actions";
import { loadHistory } from "./message";
import { fetchHistory } from "./message-handlers";

export const messageModule = createModule("message", (module) => {
  // handle — this module does the work of loadHistory while it is mounted
  module.handle(loadHistory, fetchHistory);
  module.on(loadHistory.pending, () => console.log("show the spinner"));
  module.on(loadHistory.cancel, () => console.log("a newer load replaced it"));
});
```

## Send a message that can fail

**Problem.** A message must appear at once, go out in the order it was sent, be tried again after a failure, and show as failed if it never arrives. The outcome `fail` carries only the error, not the call, so the page cannot tell which message failed.

**When.** An action has a visible result that can fail and that must keep its order.

`queue` keeps the order, `retry` tries a failed call again, and the handler throws an error that carries the id of the message:

```js
import { retry } from "nanoeffects/effects";
import { queue } from "nanoeffects/policies";

class SendFailed extends Error {
  constructor(localId, cause) {
    super(cause.message);
    this.localId = localId;
  }
}

// A 400 is an answer: asking again gives the same answer. A 503 or a lost connection may pass.
const isWorthRetrying = (error) => !(error.status < 500);

// retry — try a failed send again, up to 3 attempts, 200 ms apart, unless the answer was a "no"
const attempt = retry(
  async (call, { signal }) => {
    const message = await api.send(call.roomId, call.text, { signal });
    return { localId: call.localId, message };
  },
  { times: 3, delay: 200, shouldRetry: isWorthRetrying },
);

// queue — messages go out one after another, in the order they were sent
export const deliver = queue(async (call, ctx) => {
  try {
    return await attempt(call, ctx);
  } catch (error) {
    throw new SendFailed(call.localId, error);
  }
});
```

The module adds the message on `pending`, marks it delivered on `success`, and marks the message named by the error as failed on `fail`. Send `/fail hello` to see a failure that is not tried again, and send a few messages to meet the 503 that is.

## Search where one room is slow

**Problem.** A search asks every room. If it waits for all of them and one room is slow or broken, the reader sees nothing. If it fails on the first error, the rooms that answered are lost.

**When.** One action fans out to several sources and a partial answer is better than none.

`timeout` limits each request, and `allSettled` waits for every request to end, whether it succeeded or failed. The handler keeps the hits and the names of the rooms that did not answer:

```js
import { allSettled, timeout } from "nanoeffects/effects";
import { debounce, latest } from "nanoeffects/policies";

const rooms = [{ id: "general", name: "General" }, { id: "random", name: "Random" }];

const searchRoom = (room, query) => ({ signal }) => api.searchRoom(room.id, query, { signal });

// timeout — a room that does not answer in 1.5 s fails with a timeout error
const askRoom = (room, query) => {
  const request = searchRoom(room, query);
  return (parent) => timeout(parent, 1500, request);
};

// debounce — wait for quiet; latest — a newer query aborts the older search
export const runSearch = debounce(
  300,
  latest(async (query, ctx) => {
    // allSettled — ask every room at once and wait for all of them, however each one ends
    const outcomes = await allSettled(ctx, rooms.map((room) => askRoom(room, query)));
    return outcomes.map((outcome, index) => ({ room: rooms[index], outcome }));
  }),
);
```

`all` would fail the whole search on the first slow room, which is the wrong behavior here. See [Effects](effects.md) for the others.

## Wait for a room before marking a result

**Problem.** The reader opens a search result from another room. The message cannot be marked until that room's history has loaded, and the handler must not guess how long that takes.

**When.** A feature starts work in an entity and needs to continue after its outcome.

`take` waits for the next event of a name. Start it before the emit that causes the event, so nothing is missed:

```js
import { createAction } from "nanoeffects/actions";
import { take } from "nanoeffects/effects";

// createAction with a handler — an order for the message entity, with the handler that does it
const markMessage = createAction("messages/mark", (messageId) => console.log("mark", messageId));

// the room that is open, kept from the rooms/selected event
let selectedRoom = "general";

export const goToResult = async (hit, ctx) => {
  if (hit.roomId !== selectedRoom) {
    // take — wait for the next event of that name; started before the emit so nothing is missed
    const loaded = take(ctx, "messages/loadHistory/success");
    ctx.emit("rooms/selected", hit.roomId);
    await loaded;
  }
  // ctx.emit with an action that has a handler — the message entity marks the message
  ctx.emit(markMessage(hit.id));
};
```

## Poll for new messages

**Problem.** New messages come from the server, and the page has to ask for them at an interval. The polling must stop when the feature is switched off, and one failed request must not stop it.

**When.** A feature has background work that lives as long as the feature does.

`poll` calls a function now and then at an interval, and ends when its context is aborted. A module starts the task with `spawn`, and unmounting the module aborts it:

```js
import { createModule } from "nanoeffects/actions";
import { poll } from "nanoeffects/effects";

const watchUpdates = async (_, ctx) => {
  // the number of the last update seen; the first answer only tells where the server is
  let since;

  const check = async () => {
    try {
      const updates = await api.loadUpdates(since, { signal: ctx.signal });
      since = updates.seq;
      for (const message of updates.messages) {
        // ctx.emit — after an abort it delivers nothing
        ctx.emit("incoming/received", message);
      }
    } catch {
      // one failed request must not end the polling: the next tick asks again
    }
  };

  // poll — call `check` now and then every 3 s; an abort of ctx (an unmounted module) ends it
  await poll(ctx, check, 3000, { leading: true });
};

export const receiveMessagesModule = createModule("receive-messages", (module) => {
  // spawn — a background task that lives as long as this module
  module.spawn(watchUpdates);
});
```

In the example a button calls `app.unmount(receiveMessagesModule)` and `app.mount(receiveMessagesModule)`, so you can watch the polling stop (the Network panel shows no more `updates` requests) and start.

## Know where each value lives

Each entity and each feature that has state keeps it in a [Zustand](https://zustand.docs.pmnd.rs/) store that the module writes and a component reads with `useStore`. Each store lists its mutations, such as `startLoading(roomId)` and `markFailed(localId)`, and a module calls them with the data of an event: `module.on(loadHistory.pending, startLoading)`. A mutation that sets plain values gives `set` an object, as in `set({ searching: true })`. The store of the message entity uses the `immer` middleware, so a mutation that changes a list can change it in place, as in `state.messages.push(message)`, and the store still gives React a new object. Nothing else writes the state. The list of rooms is the exception: it is read with one `useEventState` in a provider at the root. `useEventState` is not a store: an event that came before the provider mounted is lost, and a second component gets its own copy. See [Show the last value of an event as state](react.md#show-the-last-value-of-an-event-as-state).

## Where to go next

- The API of actions, jobs and modules: [Actions, jobs and modules](actions.md).
- Policies such as `latest` and `queue`: [Policies](policies.md). Effects such as `allSettled`, `take` and `poll`: [Effects](effects.md).
- A smaller project with two domains: [Start with domains](starter.md#start-with-domains). Its two domains do not talk to each other, so it needs no layers.
