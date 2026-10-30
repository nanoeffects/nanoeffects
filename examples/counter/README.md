# Counter example

The counter of the redux-saga tutorial, with the delay that `takeLatest` is shown with, the cancel
of `cancellable-counter`, and a call that fails. It has no network: a small fake server stands in.

One project, two pages with the same buttons and the same events:

| Page | State | Files |
| ---- | ----- | ----- |
| `index.html` | The page keeps the count; the handlers send `counter/incremented` and `counter/failed` | `src/plain/` |
| `redux.html` | Redux Toolkit keeps it; the handlers dispatch the actions of the slice through `ctx.store` | `src/redux/` |

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` and `http://localhost:5173/redux.html`.

## What each button does

| Button | What happens | In redux-saga |
| ------ | ------------ | ------------- |
| +1 | The count goes up at once | `put` |
| +1 after 1 s | Adds one after a second. A second click inside that second replaces the first, so one is added | `takeLatest` and `delay` |
| Cancel | Stops the one that waits. The count does not change | `race` and `take` of a stop action |
| +1 from a flaky server | The fake server fails twice and answers on the third try. The handler tries again and adds one | `retry` |
| Always fails | Every try fails. After the third, the page shows the message | `try`/`catch` around `call` |

The handlers are in `src/plain/handlers.ts` and `src/redux/handlers.ts`:

- `latest` keeps only the newest click, as `takeLatest` does.
- `race(ctx, { waited, cancelled })` ends when the second passes or the cancel event comes; the loser is aborted through its `signal`.
- "Cancel" is an event because a button is outside the task: `abort` stops a task from inside it. `take` waits for that event by its name.
- A newer click aborts the one before it, and the `catch` ignores an aborted task: that is not a failure.

## Where the two versions differ

The two handlers are the same code except for the lines that report a result:

```ts
ctx.emit(incremented());          // index.html: the page adds one
ctx.store.dispatch(incremented()); // redux.html: the reducer adds one
```

The same goes for `failed`. The Redux page reads the store with `useSyncExternalStore`, which is
what `useSelector` of `react-redux` does underneath; a real app would use `react-redux`. The bus
keeps no values, so the plain page keeps the count itself. A value that several components read
belongs in a store, which is what `redux.html` shows.

## Errors

Both buses are made with `onError`, so a handler that throws and does not catch its error is
written to the console and does not stop the other handlers. See [Handle errors](../../docs/errors.md).

For a request instead of a delay, see [spells](../spells) and [pokedex](../pokedex).
