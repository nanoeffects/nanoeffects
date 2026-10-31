# Rick and Morty example

A browser for characters of [Rick and Morty](https://rickandmortyapi.com) with
[React Query](https://tanstack.com/query). React Query keeps the cache and the state of the screen
(`isPending`, `data`, `error`, the pages). nanoeffects runs the requests: each one is a command that
carries its handler.

```bash
npm install
npm run dev
```

The commands are in `src/characters.ts`:

```ts
export const findCharacters = createAction(
  "characters/find",
  timeout(8000, retry(load, { times: 3, delay: 300, shouldRetry: isFailure })),
);
```

`App.tsx` calls a command from a `queryFn` and hands it the signal of React Query
(`signalPlugin` in `src/bus.ts`):

```ts
queryFn: ({ signal }) => bus.emit(findCharacters(query), { signal }),
```

| What you do | What happens | Who does it |
| ----------- | ------------ | ----------- |
| Search again while a page loads | The older request is cancelled in the Network panel | React Query aborts, the signal reaches `fetch` |
| Search for a name nobody has | An empty list, no error, no retry: the API answers 404, and `findCharacters` turns it into an empty page | `retry` with `shouldRetry` |
| Switch the network off | The request is tried again, 3 attempts, and stops after 8 s at most | `retry`, `timeout` |
| Type `mor` | After 250 ms of quiet up to 5 names appear under the box; a newer text cancels the older request. Arrows, Enter, Escape and a click work; choosing a name runs the search | `debounce`, `latest`, `timeout` |
| Press "Load more" | The next page is added to the list | `useInfiniteQuery` |

The suggestions are a command too (`suggestCharacters`), but React Query does not keep them: they
are state of the input for a few key presses. They have no `retry` on purpose, because a lost
suggestion costs nothing and the next key press asks again.

React Query's own `retry` is switched off in `src/main.tsx`, so the retries are the ones of the
command and are not multiplied.
