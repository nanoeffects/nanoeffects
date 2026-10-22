# redux-effects-middleware Specification

## Purpose
Connect a Redux store to a bus that already exists, so the actions of the store reach the handlers of the bus and the handlers can read and dispatch to the store.

## ADDED Requirements

### Requirement: The middleware is made from a bus
`createEffectsMiddleware(bus, options?)` SHALL take an existing bus as its first argument and return a Redux middleware for that bus. It SHALL NOT create a bus, and it SHALL NOT change what the bus does for events that do not come from Redux.

#### Scenario: Actions of the store reach the bus
- **WHEN** a store is created with the middleware of a bus, a handler is bound to `user/requested` on that bus, and `store.dispatch({ type: "user/requested", payload: "7" })` runs
- **THEN** the handler receives `"7"` after the reducers have handled the action

#### Scenario: The same bus serves the app
- **WHEN** a handler is bound to the bus and `bus.emit("user/requested", "7")` is called without Redux
- **THEN** the handler runs as it does for any bus

### Requirement: Tasks get the store
After Redux has installed the middleware, every task context made by the bus SHALL have `ctx.store` with `getState` and `dispatch` of that store. A bus that already adds fields to its contexts (through `effectsPlugin`, `contextPlugin` or the `context` option) SHALL keep them.

#### Scenario: A handler dispatches through ctx.store
- **WHEN** a handler of `user/requested` calls `ctx.store.dispatch(userLoaded(user))`
- **THEN** the reducer handles `userLoaded` and `ctx.store.getState()` shows the new state

#### Scenario: Fields of other plugins stay
- **WHEN** the bus has `effectsPlugin({ race })` and the middleware is installed
- **THEN** a handler has both `ctx.race` and `ctx.store`

#### Scenario: Before the middleware is installed
- **WHEN** a task runs before Redux has installed the middleware
- **THEN** `ctx.store` is absent and nothing throws

### Requirement: A handler does not loop on its own action
An action that a handler dispatches through `ctx.store`, with the type of the event that handler works on, SHALL NOT go back to the bus, for that handler or for the other handlers of that type.

#### Scenario: A handler dispatches its own type
- **WHEN** a handler of `a` dispatches `{ type: "a" }` through `ctx.store`
- **THEN** no handler of `a` runs again for that action

#### Scenario: A longer path is not blocked
- **WHEN** a handler of `a` dispatches `b`, and a handler of `b` exists
- **THEN** the handler of `b` runs

### Requirement: A failing handler does not break dispatch
An error of a handler SHALL NOT be thrown to the caller of `dispatch`. If the bus has an `onError`, the bus handles the error as it does for any emit; if it has none, the middleware SHALL report the error with `console.error` and the remaining work of `dispatch` SHALL finish. Errors of reducers SHALL still reach the caller.

#### Scenario: onError is set on the bus
- **WHEN** a handler throws and the bus has `onError`
- **THEN** `onError` receives the error and `dispatch` returns normally

#### Scenario: onError is not set
- **WHEN** a handler throws and the bus has no `onError`
- **THEN** the error is reported with `console.error` and `dispatch` returns normally

#### Scenario: A reducer throws
- **WHEN** a reducer throws on `dispatch`
- **THEN** the error reaches the caller of `dispatch`

### Requirement: Actions can be filtered, and thunks pass through
With `filter` in the options, an action for which it returns `false` SHALL NOT reach the bus. A value that is not a plain action (such as a thunk) SHALL go through the middleware untouched.

#### Scenario: A filtered action
- **WHEN** `filter` returns `false` for `{ type: "internal/tick" }`
- **THEN** no handler of that type runs

#### Scenario: A thunk
- **WHEN** a function is dispatched
- **THEN** the middleware passes it on and the bus gets nothing
