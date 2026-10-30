# Job worker example

A background worker with an in-memory queue, behind a [Fastify](https://fastify.dev) app. A client posts an email and gets an
answer at once; the worker sends it later through a fake mailer that fails on a known schedule.
It shows how a service **stops without losing or half-doing the work in flight**.

You need Node 18 or newer. No database, no network.

```bash
npm install
npm start
```

Post some emails in another terminal and read the counts:

```bash
curl -X POST localhost:3000/emails -H 'content-type: application/json' \
  -d '{"to":"a@b.c","subject":"hello"}'
curl localhost:3000/stats
```

| What you do | What happens | Wrappers |
| ----------- | ------------ | -------- |
| `POST /emails` | Fastify checks the body against a schema (400 if it is wrong); the answer is 202 with an `id` at once, and the email is queued | `createJob` |
| Post ten emails | At most three are sent at the same time; the rest wait | `queue` |
| The mailer answers 503 (every fourth attempt) | The attempt is tried again after a growing pause | `retry` |
| A subject that starts with `/hang` | The mailer never answers; after 1 s the attempt fails and is not tried again | `timeout` |
| A subject that starts with `/bad` | The mailer refuses at once with a 400; it is not tried again | `retry` with `shouldRetry` |
| `GET /stats` | `{ queued, running, sent, failed, cancelled }`; they add up to the emails accepted | the outcomes of the job |

## Stop without losing work

Press Ctrl+C (SIGINT) or send SIGTERM. The log shows three steps:

1. **Stop taking emails.** `POST /emails` answers 503 from now on.
2. **Wait for the work in flight**, for at most `DRAIN_MS` (default 5000). `race` waits for the
   first of two things: an `idle` event that the worker sends when nothing is queued or running
   (`take`), or the end of the time (`delay`).
3. **Abort the rest.** Every `bus.emit` of the job was given the same `AbortSignal`; aborting it
   ends the calls that are still running or waiting with the outcome `cancel`. The process prints
   the counts and exits with 0.

Try it: post a few `/hang` emails and press Ctrl+C with `DRAIN_MS=300 npm start`. The last line
shows them in `cancelled`. With the default time the same emails time out first and show in
`failed`.

Unmounting the worker module does not stop a call that is running: the module owns its listeners,
not the calls it served. That is why the shutdown aborts a signal instead.

One thing to know about `queue` when you abort: it frees the slot of the call that was running
and starts the next waiting call before that call's own context is aborted. A waiting call
therefore runs its handler up to the first `await` and then ends with `cancel`. The fake mailer is
safe (it starts a timer and the abort clears it). If your handler has a side effect before its
first `await`, check `ctx.signal.aborted` first.

The files, each with one job:

- `src/mailer.ts` — the fake mailer and `MailError`.
- `src/jobs.ts` — the job `email/send` and the event `email/idle`.
- `src/worker.ts` — the module that binds the job, the counts, `accept` and `shutdown`.
- `src/server.ts` — `buildServer`: `POST /emails` and `GET /stats`.
- `src/main.ts` — listens on `PORT` (default 3000) and wires the signals.

The tests of this example are in `src/tests/backend-examples.test.ts` of the repository; they use Fastify's `inject`. The files
in this folder are not part of the published package.
