## ADDED Requirements

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
