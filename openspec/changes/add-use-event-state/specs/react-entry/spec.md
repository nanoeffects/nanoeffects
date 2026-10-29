## ADDED Requirements

### Requirement: The plugin adds useEventState to the bus
`bus.use(reactPlugin())` SHALL also give the bus `useEventState(event, initial)`. `event` SHALL be an event name of the bus or an action creator, and `initial` SHALL have the payload type of that event, or be a function that returns it. The hook SHALL return `[state, setState]` typed as `useState` of the payload type. The method SHALL be a closure over the bus, so `const { useEventState } = bus` gives a hook that works without the bus around it.

#### Scenario: The hook is exported on its own
- **WHEN** an app writes `export const { useEventState } = bus` and a component calls `useEventState(searchLoaded, [])`
- **THEN** it behaves exactly as `bus.useEventState(searchLoaded, [])`

#### Scenario: The state type comes from the event
- **WHEN** a TypeScript caller passes an `initial` whose type is not the payload of the event
- **THEN** TypeScript rejects the call, and `state` has the payload type otherwise

### Requirement: useEventState keeps the last payload as state
The first render SHALL return `initial` (a function is called once, as `useState` does). While the component is mounted, every emit of `event` SHALL set the state to its payload and re-render, also when the payload is a function, which SHALL be stored and not called. An equal payload (`Object.is`) SHALL NOT re-render. `setState` SHALL be the stable function of React: it sets the state without touching the bus.

#### Scenario: An event sets the state
- **WHEN** a mounted component uses `useEventState(searchLoaded, [])` and the bus emits `searchLoaded` with `["a"]`
- **THEN** the component renders again with `state` equal to `["a"]`

#### Scenario: A function payload
- **WHEN** the payload of the event is a function
- **THEN** `state` is that function and it has not been called

#### Scenario: A lazy initial
- **WHEN** `initial` is a function
- **THEN** it is called once, on the first render, and its result is the first `state`

#### Scenario: A local set
- **WHEN** the component calls `setState` with a value
- **THEN** the state changes as with `useState` and nothing is emitted

### Requirement: useEventState subscribes for the life of the component
The hook SHALL subscribe after the first commit and unsubscribe when the component unmounts, so a mounted component holds one listener for `event` and an unmounted one holds none. It SHALL work under StrictMode (the extra mount and unmount leave one listener) and SHALL NOT resubscribe on a render that has the same `event`. An emit before the subscription exists, or after the unmount, SHALL NOT reach the component; the bus keeps no value to replay.

#### Scenario: Unmount
- **WHEN** the component unmounts
- **THEN** the bus has no listener of the hook and a later emit does not touch React

#### Scenario: StrictMode
- **WHEN** the component mounts under StrictMode
- **THEN** one emit of the event sets the state once and the bus has exactly one listener

#### Scenario: A new event
- **WHEN** a later render passes another event
- **THEN** the hook unsubscribes from the old one and subscribes to the new one
