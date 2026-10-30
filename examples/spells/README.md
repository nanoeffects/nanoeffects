# Spells example

The smallest example of a command: a search for Harry Potter spells against
[PotterAPI](https://potterapi-fedeperin.vercel.app), with no domains, no modules and no store.

```bash
npm install
npm run dev
```

All the logic is in `src/spells.ts`: one command that carries its handler.

```ts
export const searchSpells = createCommand(
  "spells/search",
  debounce(300, latest(timeout(5000, retry(load, { times: 3, delay: 300 })))),
);
```

`bus.emit(searchSpells(query))` gives back the spells. It gives back `undefined` when the call was
dropped by the quiet time or replaced by a newer search, and the component ignores that.

| What you do | What happens | Wrappers |
| ----------- | ------------ | -------- |
| Type fast | One request starts after 300 ms of quiet | `debounce` |
| Type while a request runs | The older request is cancelled in the Network panel; its result never arrives | `latest` |
| Switch the network off | The request is tried again, 3 attempts, and stops after 5 s at most | `retry`, `timeout` |

The page counts the searches in flight to show "Searching…": a call that is dropped settles at once,
so a plain on and off flag would be cleared too early. When several components read the state of a
call, or you want its loading, success and failure as events, use a job: see the
[chat](../chat) and the [pokédex](../pokedex).
