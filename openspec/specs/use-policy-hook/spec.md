# use-policy-hook Specification

## Purpose
Lets a React component hold a policy (`debounce`, `throttle`, `latest`, `leading`, `queue`) as one stable function whose callback is always the latest one, so a debounced or throttled handler works across renders without a bus and without stale closures.

## Requirements

### Requirement: usePolicy returns a stable function
`usePolicy(callback, make, deps?)` SHALL return a function made by `withPolicy`. Its identity SHALL NOT change between renders while `deps` do not change. `deps` SHALL default to an empty list.

#### Scenario: Same identity across renders
- **WHEN** a component renders twice with a new inline `callback` each time and the same `deps`
- **THEN** `usePolicy` returns the same function both times

### Requirement: The policy is made once and sees the latest callback
`make` SHALL be called with a task that calls the `callback` of the latest render, and its result SHALL be kept across renders. The state of the policy (a debounce timer, a throttle window, a queue) SHALL NOT be reset by a re-render.

#### Scenario: Debounce survives re-renders
- **WHEN** `const onChange = usePolicy(callback, (task) => debounce(100, task))` is used, `onChange("a")` is called, and the component re-renders before 100 ms pass
- **THEN** the pending call is not cancelled and `callback` runs once after the wait

#### Scenario: No stale closure
- **WHEN** the component re-renders with a new `callback` that reads new props, and the pending debounced call then fires
- **THEN** the callback of the latest render runs, not the one of the render that made the call

### Requirement: A change of deps makes a new policy
When an item of `deps` changes, `usePolicy` SHALL cancel the pending calls of the old function and return a new function with a policy made by `make` again.

#### Scenario: A new wait time
- **WHEN** `deps` is `[wait]` and `wait` changes from 100 to 200
- **THEN** the pending call of the old function is cancelled and the new function debounces by 200 ms

### Requirement: Unmount cancels pending calls
When the component unmounts, `usePolicy` SHALL call `cancel()` on the function, so no callback runs after unmount. The hook SHALL keep working when React runs an effect twice (Strict Mode): the function SHALL be usable after the simulated unmount.

#### Scenario: Pending call at unmount
- **WHEN** `onChange("a")` is pending and the component unmounts
- **THEN** `callback` never runs

#### Scenario: Strict Mode
- **WHEN** the component mounts under `StrictMode` and `onChange("a")` is then called
- **THEN** `callback` runs once with `"a"` after the wait

### Requirement: usePolicy lives in the react entry only
`usePolicy` SHALL be a named export of `nanoeffects/react`. `nanoeffects/policies` and the core SHALL NOT import React. No ready-made hooks (`useDebounce`, `useThrottle`, ...) are added.

#### Scenario: Not imported, not bundled
- **WHEN** an app imports `reactPlugin` but not `usePolicy` and is bundled
- **THEN** the code of `usePolicy` is not in the output

### Requirement: make may be a wrapper from a curried policy
`usePolicy(callback, make, deps?)` SHALL accept as `make` the wrapper that a policy returns when it is called without a task (`debounce(1000)`, `latest()`, `queue({ key })`), and SHALL treat it as a function written by hand: it is called once with the task of the hook, and again when an item of `deps` changes. A new wrapper made on every render SHALL NOT reset the policy. The form `(task) => policy` SHALL keep working.

#### Scenario: Wrapper as make
- **WHEN** `const onChange = usePolicy(callback, debounce(100))` is used, `onChange("a")` is called, and the component re-renders (making a new `debounce(100)`) before 100 ms pass
- **THEN** the pending call is not cancelled and the latest `callback` runs once after the wait

#### Scenario: The wait time is read when the policy is made
- **WHEN** `usePolicy(callback, debounce(wait), [wait])` is used and `wait` changes from 100 to 200
- **THEN** the pending call of the old function is cancelled and the new function debounces by 200 ms

#### Scenario: Composition by hand
- **WHEN** `usePolicy(callback, (task) => throttle(100, latest(task)))` is used
- **THEN** it works as before
