# Chat example

A React and TypeScript chat that shows where logic goes when an app has several features:
domains (rooms, messages, search, incoming) with their events, handlers and modules, and a thin
UI. It is explained in [Build a chat with domains, modules and a
small server](../../docs/chat-example.md).

```bash
npm install
npm run dev
```

`npm run dev` starts a small Fastify server (`server/server.js`) and Vite together. The server
keeps its data in memory and misbehaves on a known schedule, so the page has something to survive:

| What you do | What the server does |
| ----------- | -------------------- |
| Send a message | Every third send answers 503; the page tries again. |
| Send `/fail hello` | Answers 400; the page shows the message as failed and does not try again. |
| Search a word that is in the room Random | Random answers after 2.5 s, which is too late: the search names it as skipped. |
| Wait | A new message arrives every 4 s. |

Start the server with `CHAOS=off npm run dev` to turn these rules off.

Open the Network panel of the browser and switch rooms quickly: the older request is cancelled,
and the server prints `aborted: ...` for it.
