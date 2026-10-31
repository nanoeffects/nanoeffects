# Build a chat widget that listens only while it is open

Use this page when a site has a chat with a bot behind a launcher button, and the chat must cost nothing while it is closed. Closed means no subscriptions on the bus, no polling, no keyboard listener, and no request still running. Opening turns all of it on, and closing turns all of it off in one call.

The code is in [`examples/chat-widget`](../examples/chat-widget): plain DOM and TypeScript, a fake bot in the browser, no server. Run it on [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/chat-widget), or on your machine:

```bash
cd examples/chat-widget
npm install
npm run dev
```

It is a level D example: the logic lives in one module, and the page only mounts and unmounts it. For an app with several features see [Build a chat with entities, features, modules and a small server](chat-example.md).

## Know what happens on open and on close

| Moment | What happens |
| ------ | ------------ |
| Open | The module is mounted: the bot handler is subscribed, the operator messages are polled, the `Escape` listener is added. The panel is drawn and listens to the bus. |
| The user sends a text | The bot is asked, one text after another, with a time limit and a retry. |
| `Escape` | The module emits `chat/closeRequested`; the launcher closes the chat. |
| Close | The panel is removed and unsubscribed, the module is unmounted. A request in flight is aborted, the polling stops, the `Escape` listener goes away. |

## Find the parts in the files

| File | Job |
| ---- | --- |
| `src/bus.ts` | The bus, and `modulePlugin()` with no module: the launcher mounts the module itself. |
| `src/chat.ts` | The events only: `messageSent`, `messageAdded`, `typingChanged`, `closeRequested`. |
| `src/chat-handlers.ts` | `askBot` (`timeout` and `retry` inside) and `watchOperator` (`poll`): plain `async` functions that know nothing about the page. |
| `src/chat-module.ts` | The list of what is alive while the chat is open. |
| `src/panel.ts` | The view: shows the lines, sends the texts, returns one function that removes it. |
| `src/main.ts` | The launcher: the only file that knows both the module and the panel; it listens for `closeRequested` only while the chat is open. |

## Bind everything in one module

A module is the list of what is alive while the chat is open. When it unmounts, the bus undoes every line of it.

<!-- docs-check: skip - the other files of the example are in examples/chat-widget -->
```js
// chat-module.js
import { createModule } from "nanoeffects/actions";
import { queue } from "nanoeffects/policies";
import { closeRequested, messageSent } from "./chat";
import { askBot, watchOperator } from "./chat-handlers";

// a task that stays pending until the module unmounts; its signal then aborts
const untilAborted = (ctx) =>
  new Promise((resolve) => {
    ctx.signal.addEventListener("abort", resolve, { once: true });
  });

// a DOM listener that lives as long as the module: `signal` removes it when it aborts
const listenToEscape = async (_, ctx) => {
  const onKey = (event) => {
    if (event.key === "Escape") {
      ctx.emit(closeRequested());
    }
  };
  document.addEventListener("keydown", onKey, { signal: ctx.signal });
  await untilAborted(ctx);
};

export const chatModule = createModule("chat", (module) => {
  // module.run — runs askBot as a child task of the module, so an unmount aborts it
  const answer = (text) => module.run(askBot, text);
  // on + queue — answer the texts one after another, in the order they were sent
  module.on(messageSent, queue(answer));
  // spawn — a background task that lives as long as the module
  module.spawn(watchOperator);
  module.spawn(listenToEscape);
});
```

Three details that make the cleanup complete:

- **`module.run`, not `askBot` directly.** A handler given to `module.on` runs as a child of whoever emitted the event (here the panel), so unmounting stops listening but does not abort a request that is already running. Running it with `module.run` makes it a child of the module.
- **`queue`, not `latest`.** `queue` keeps the order when the user sends two texts fast. [`latest`](policies.md) would abort the first answer, which is wrong for a conversation.
- **A DOM listener with `signal`.** `addEventListener` takes a `signal` option and removes the listener when it aborts. The task stays pending until then, because a task that has finished is not aborted again.

## Open and close from the launcher

`app.mount` returns the function that unmounts the module. `bus.on` returns the one that unsubscribes. The launcher puts them together with the one that removes the panel into a single `close`.

<!-- docs-check: skip - the other files of the example are in examples/chat-widget -->
```js
// main.js
import { app, bus } from "./bus";
import { closeRequested } from "./chat";
import { chatModule } from "./chat-module";
import { renderPanel } from "./panel";

const button = document.querySelector("#chat-launcher");
let close = null; // set while the chat is open

const open = () => {
  const stopModule = app.mount(chatModule); // subscriptions, polling and Escape start
  const stopPanel = renderPanel(document.body);
  // the module emits closeRequested on Escape; nothing does while the chat is closed
  const stopEscape = bus.on(closeRequested, () => close?.());
  close = () => {
    stopEscape();
    stopPanel();
    stopModule(); // everything the module started ends, a running request included
    close = null;
  };
};

button.addEventListener("click", () => {
  if (close) {
    close();
  } else {
    open();
  }
});
```

While the chat is closed the launcher holds no subscription at all: it only has the click listener of the button, which is a DOM listener, not a listener of the bus.

## Check that closing cleans up

1. Open the chat and send a text. The bot answers after about a second. Every third question fails, and the retry asks again.
2. Send a text and close the chat before the answer arrives. No line appears, also when you open the chat again.
3. Look at the box "Listeners on the bus": it shows `bus.get(event).length` for four events and updates when the chat opens or closes. Closed: every event shows `0`, and so does "all events". Open: each of the four has one listener, and "all events" is `4`. That is the proof that nothing is left subscribed.
4. Wait 10 s with the chat closed. The operator is not polled: no line from the operator appears.
5. Press `Escape` with the chat closed. Nothing happens. Open the chat and press it again: it closes.
6. Open the chat again. The old lines are back, and the polling runs.

`src/tests/chat-widget-example.test.ts` checks the same points without a browser.

## Where to go next

- Show an unread count on the launcher while the chat is closed: a second module that stays mounted and listens only to `chat/messageAdded`.
- Replace the polling by a WebSocket in a spawned task: the abort closes it the same way (see [`examples/trades`](../examples/trades) for a socket under `retry` and `latest`).
- Watch the whole thing in the [trace](tracing.md): the module, the bot task, the retries and the polling are tasks of one tree.
