## MODIFIED Requirements

### Requirement: A command has match
An action creator (so also a command, an action made with a handler, and a job) SHALL have `match(action)`, which returns `true` when the type of `action` is the type of the command, and narrows the type of `action` to `{ type: T; payload: P }` for the command's literal type and payload type.

#### Scenario: The type is compared
- **WHEN** `getUser.match({ type: "user/get", payload: "1" })` and `getUser.match({ type: "other" })` are called for `createAction("user/get", handler)`
- **THEN** the first returns `true` and the second `false`

#### Scenario: A job is matched as a command
- **WHEN** `loadUser.match(action)` is called for a job made with `createJob("user/load", ...)`
- **THEN** it is `true` for an action of type `user/load`

#### Scenario: The action type is narrowed
- **WHEN** `if (getUser.match(action))` is checked for a command with the payload `string`
- **THEN** inside the branch `action.payload` has the type `string`
