# Redux, Zustand, MobX

## Redux

`createEffectsMiddleware()` from `nanoeffects/redux` gives you a bus and the Redux middleware that feeds it: the effects of an app in one place, without sagas. Every action goes to the bus after the reducers have handled it, so a handler that reads the store sees the new state, and every task gets `ctx.store` (`dispatch` and `getState`).

```ts
type Events = { userRequested: string } & WithContext<{ store: ReduxStoreApi<RootState> }>;

const effects = createEffectsMiddleware<Events>();

const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().concat(effects.middleware),
});

effects.bus.on(userRequested, latest(async (id, { store, signal }) => {
  store.dispatch(userLoaded(await fetchUser(id, { signal })));
}));
```

It looks after what is easy to get wrong:

- **A handler does not loop on its own action.** An action that a handler dispatches through `ctx.store` and that has the type the handler works on does not go back to the bus. The action is not marked or changed: the middleware remembers which task dispatched it. Other handlers of that type do not get it either. Longer cycles, `a` to `b` to `a`, are yours to avoid.
- **A failing handler does not break `dispatch`.** Errors go to `onError` (default `console.error`), as in Redux Toolkit listeners. Reducers still throw to the caller.
- **The store gets to the tasks by itself**, though the bus is made before the store: `ctx.store` appears when the middleware is added.

Options are those of `createBus` (except `context`, which adds fields next to `store`) and `filter`, which keeps the actions it rejects away from the bus. Values that are not plain actions (thunks) go through untouched. Nothing here depends on Redux.

## Zustand, MobX and other stores

No adapter is needed: a store tells about its changes, and `bus.emit` is a call.

```ts
// Zustand
const stop = store.subscribe((state, previous) => {
  if (state.user !== previous.user) bus.emit(userChanged, state.user);
});

// MobX
const stop = reaction(() => store.user, (user) => bus.emit(userChanged, user));

bus.on(userChanged, latest((user, { signal }) => sync(user, { signal })));
```

Stop watching with what the store returned: `onAbort(ctx, stop)` inside a task, or `m.signal.addEventListener("abort", stop)` in a module.

The other way, give the store to the tasks, `createBus({ context: { store } })`, and change it from a handler: `setState` for Zustand, an action of the MobX store (it wraps `runInAction`). A handler that changes the value it was started by emits the event again, so watch the smallest part of the state. For a MobX `flow`, `onAbort(ctx, () => promise.cancel())` cancels it with the task.
