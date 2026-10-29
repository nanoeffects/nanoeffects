# Design

## Context

`reduxDevtools` (`src/trace/redux.ts`) builds an action from a trace event with `{ ...event, type, event }`, so the event's `payload` goes out in the emit action and in every stage action. `src/trace/redux-contract.test.ts` shows the cost (a 1000 item payload is in all three actions of a call, a 100 000 item one is about 1 MB each) and that a circular or `BigInt` payload makes the serializer of the extension fail; the failure is caught and reported by the logger path and never breaks the task.

A stage has no link to its emit: the emit event is a leaf (no `parentId`, no `rootId`), and the stage is below the silent listener task. So on the phases that end a call without a result, the payload of the stage is the only way to tell which call it was.

## Goals / Non-Goals

**Goals:**
- A quiet default: the payload once, where it is needed, not in every action.
- A way to keep payloads out of the extension completely, for size and for data that must not leave the app.
- A way to get the 0.12 output.

**Non-Goals:**
- Linking a stage to its emit, so that stages could drop the payload altogether.
- A function to trim or map the payload, or a size limit.

## Decisions

**1. Three named values of one option, not a boolean.**
`"all" | "essential" | "none"`. A boolean cannot say the middle, and `true | "essential" | false` mixes two kinds of values for one axis. Strings read the same in the docs and in a config file.
*Names considered:* `"include"` for all (a verb, unlike the other two), `"emits"` for the middle (wrong: the middle also sends the lost calls). `"essential"` is the payload that identifies a call, and the docs say which phases it means. `"none"` over `false` for the same axis.

**2. "Essential" is decided by the phase.**
The payload goes with the emit actions and the phases `cancel`, `drop` and `error`. `start` and `done` repeat the emit one to one, so they drop it. A phase list in the logger is one constant; no stage knows about it. A stage that is not `start` or `done` always ends a call that has no result to look at, which is when you need to know which call it was.

**3. The default is `"essential"`.**
The logger is quiet by default (see `devtools-emit-and-policies`), and a copy of the payload in every action is the opposite. The cost is a change of output from 0.12 for `start`/`done`, which is small and recorded as **BREAKING** in the changelog with `payload: "all"` as the way back. *Alternative: default `"all"`:* keeps 0.12 output, and the copies stay by default.

**4. The field is left out, not set to `undefined`.**
`JSON.stringify` drops `undefined` anyway, but a missing key keeps the object and the tests simple and says what the spec says.

**5. The option name and the event field are the same word.**
In `redux.ts` the option is read once into a constant and the event's `payload` is taken apart with a rest pattern, so the two are never confused in one scope.

## Risks / Trade-offs

- [`start` and `done` have no payload by default] → the emit action right before has it, and `payload: "all"` brings it back; the docs say so.
- [With `"none"` you cannot tell which call a policy cancelled] → the docs name the cost; the stage still has `id` and the order of the list.
- [Large payloads still go out with the emit and with every lost call] → `"none"` is the way out; trimming is a later option.

## Migration Plan

Release note in `Unreleased`: the default no longer sends the payload with `start` and `done`; `payload: "all"` restores it. No data or config to move. Rollback is a revert of `src/trace/redux.ts`.
