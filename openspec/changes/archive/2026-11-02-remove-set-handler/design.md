## Context

A handler is bound to an action on a bus in three spellings that overlap: `setHandler(action, fn)` inside `actionsPlugin([...])`, `actions.handle(action, fn)`, and the list form `handle([setHandler(...)])` (also on `m.handle` of a module). `setHandler` only builds a `[action, fn]` pair for the list. The registry keeps one `Map` by type either way.

## Goals / Non-Goals

**Goals:**
- One way to bind a handler on a bus: `actions.handle(action, fn)`, which returns an unbind.
- Less API, less code, shorter docs.

**Non-Goals:**
- No `action.setHandler(fn)` on the creator. A creator is shared by every bus in the process, so a handler on it would be global mutable state: it leaks between tests, two buses cannot differ, HMR keeps stale work. It also reverses the decision that creators are never bound to a bus. `createAction(type, handler)` already covers "the handler lives with the action".
- No change to precedence (bound in the registry wins over the action's own), `bound(type)`, scopes or the lifecycle of jobs.

## Decisions

- **Remove `setHandler`, `Binding`, `actionsPlugin(bindings)` and the list overload of `handle` in the registry and in `ModuleContext`.** `Binding` is used only by those. The list form on `m.handle` goes too, or `m.handle` would keep a pair type nothing builds. Alternative: keep the list overload for tuples written by hand. Rejected: it has no use beyond `setHandler` and keeps the type.
- **`actionsPlugin()` still merges into a registry the bus has** (any plugin order); only the list step disappears, so `isRegistry` returns the existing one with no `handle` call.
- **`modulePlugin`'s wrapper** (`within` over `target.map` in `src/actions/module.ts`) loses the array branch; the single-handler path stays.
- **Docs show `const actions = bus.use(actionsPlugin()); actions.handle(sendMail, smtpSend);`** in the bus file or the handlers file, with the usual one-line comment per library call. `docs/guide.md` §8 and `docs/actions.md` "bind a handler later" drop the `setHandler` step.

## Risks / Trade-offs

- **Breaking for users of `setHandler` and `actionsPlugin([...])`** → CHANGELOG `### Breaking` with the one-line migration; the package is 0.x.
- **Order of binding at start changes from "at `use`" to "after `use`"** → a handler bound by the list was ready as soon as the plugin was used; now it is ready after `handle` runs. Emits between the two lines would see no handler. Not a problem for the documented shape (both lines are in the bus file).
- **Old `.d.ts` in `examples/*/node_modules`** mention `setHandler`; they are installed copies of old releases and are not touched.
