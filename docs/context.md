# Your own fields in the context

Add fields to the context of every task of a bus: a store, a client, a logger. Describe them in the event map with `WithContext`, and give the values in `createBus({ context })`:

```ts
type Events = { save: Draft } & WithContext<{ store: Store }>;

const bus = createBus<Events>({ context: { store } });
bus.on("save", (draft, { store }) => store.put(draft));
```

The fields are in the context of handlers, `ctx.run`, listeners added with `ctx.on`, commands, modules and the child tasks of effects and policies, and the compiler checks them: a handler of a bus without `WithContext` has no `store`, and `context` must have the fields that the map names. Two buses can have different fields.

- The fields of the library (`signal`, `emit`, `run`, ...) win when the names are the same.
- `context` can also be a function, `(task) => fields`, called with `{ type, payload }` of each task, for fields that depend on the task.
