# Design

## Context

The templates are plain trees under `packages/create-nanoeffects/templates/`, listed in one array in `index.js`; `scripts/templates-check.mjs` type-checks every `*-ts` template against `src` with the `paths` of the root `tsconfig.json`. The recipe that this template grows is in `docs/actions.md` (commands, jobs, modules) and `examples/modules.ts`. `react-ts` is the base for the React layer, the tsconfig and `package.json`. See proposal.md for why.

Observed in `src/actions`: `createCommand(name, handler?)`, `createJob(name, handler, { success, fail, pending, cancel })` with `job.pending/success/fail/cancel` creators, `createModule(name, (m) => { m.handle, m.use, m.on, m.spawn })`, `modulePlugin([modules])` and `reactPlugin()` returning the bus with more members.

## Goals / Non-Goals

**Goals:**
- A runnable project that shows where logic goes: a domain is a folder, the UI is thin.
- Cover the three things the docs name for level D: a command, a job whose outcomes drive state, a module that mounts one domain.
- Stay type-safe with the types coming from the events, no event map.

**Non-Goals:**
- A second framework, a JavaScript twin, or tests inside the template.
- New library API. A typing gap found while writing the template is raised separately.

## Decisions

- **One template, `domains-ts`, React.** The point is the folder shape, not the framework; React is what most readers have, and it makes the `useEventState` warning concrete. No `vanilla` variant: the domain files do not care about the UI.
- **Domains `catalog` and `checkout`.** `catalog` is the search of the other templates, grown into a typed product lookup (a command answered by a handler under `debounce` and `latest`, the result sent as an action). `checkout` is the case a job exists for: placing an order must not run twice (`leading`), may fail (`retry`, a fake server that fails the first call), and the UI needs a status. Alternatives: `user` and `cart` (more setup before anything runs), or only one domain (no sense of a split).
- **Layout.**

  ```
  src/bus.ts                     the bus and reactPlugin; imports no events
  src/app.ts                     bus.use(modulePlugin([catalogModule, checkoutModule]))
  src/api.ts                     the fake server
  src/domains/catalog/           catalog.ts (events), catalog-handlers.ts, catalog-module.ts
  src/domains/checkout/          checkout.ts (events), checkout-handlers.ts, checkout-module.ts, checkout-store.ts
  src/ui/                        App.tsx, ProductsProvider.tsx, SearchBox.tsx, Products.tsx, CheckoutButton.tsx
  src/main.tsx
  ```

  Handlers get the task context, so they do not import the bus; the module wires them with `m.on` and `m.handle`. The events file is the contract of the domain, the handlers file is its work, the module is its mount point. `app.ts` is separate from `bus.ts` so the bus file stays free of events, as `docs/guide.md` teaches; `docs/actions.md` puts the module list in the bus file, which is shorter but pulls events into it.
- **The job drives the UI through a store of the domain.** `checkout-store.ts` is a plain object with `get` and `subscribe` that the module updates from `pending`, `success`, `fail` and `cancel`; React reads it with `useSyncExternalStore` (the recipe of `docs/stores.md`). A flag set by hand in the handler would stay `true` after an abort (see `docs/actions.md#show-a-loading-state-with-a-job`); outcomes do not.
- **Found products come through a provider.** `ProductsProvider` at the root calls `useEventState(productsLoaded, [])` once and shares it by Context. Its comment says what the other templates say: it is not a store, an event before the mount is lost, a value that must outlive it goes to a store. The state type comes from `createAction<Product[]>`.
- **Checks.** `templates-check.mjs` already picks `*-ts` directories, so no script change is expected; a deliberately wrong payload proves it fails. `index.test.js` gets the name and a layout test that reads the domain folders. The scaffold-and-build of the packed packages is run by hand before a release (`pnpm consumer-check` for the library, a scratch install for the template).
- **Name.** `domains-ts`, following `<shape>-ts` where the shape is the layout. A name without the `-ts` suffix would hide that it is TypeScript only.

## Risks / Trade-offs

- [A typing gap: a module cannot type `m.on(creator, ...)` or a job outcome without an event map] → the check fails in the repository; fix the types in a separate change and keep the template simple, no casts to get around it.
- [The template is bigger than the others and may scare level A readers] → it is opt-in, the default stays `vanilla`, and `docs/starter.md` says when to pick it.
- [Fake server failures make the demo look broken] → the failure is deliberate and labeled in `api.ts` and the UI text, and `retry` makes the first order succeed after one retry.
- [A third copy of the starter files drifts] → the repository type-checks it, and the layout test pins the file split.

## Open Questions

- Whether `retry` should hide the failure from the UI or show it first: decided while writing the UI text, no effect on the specs.
