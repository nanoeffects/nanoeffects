# Start a project from a template

Use this page when you want a running project in one command instead of wiring Vite and the bus by hand. It makes a small app with a search box that waits for you to stop typing (`debounce`) and aborts the older request when a newer one starts (`latest`).

You need Node 18 or newer.

## Create the project

Run the command for your package manager. Replace `my-app` with the name of the new directory.

```bash
npm create nanoeffects@latest my-app
```

```bash
pnpm create nanoeffects my-app
```

```bash
yarn create nanoeffects my-app
```

```bash
bun create nanoeffects my-app
```

The command asks for the template when you do not give one. The directory must be new or empty: the command stops instead of overwriting files.

Then follow the steps it prints:

```bash
cd my-app
npm install
npm run dev
```

Open the address that Vite prints and type in the box. The fake server answers after 800 ms, so you can see the older request being aborted.

## Choose a template

Pass `--template` to skip the question. With npm, put `--` before the option.

| Template | What it shows | Use it when |
| -------- | ------------- | ----------- |
| `vanilla` | A bus, one event and a `debounce` plus `latest` handler, with plain DOM code | You use no framework, or want to see the bus alone |
| `react` | The same handler with `useEmitter` and `useEventState`, and `usePolicy` for a debounced save in a component | You build a React app |
| `vanilla-ts` | The `vanilla` app in TypeScript | You want the compiler to check events and handlers |
| `react-ts` | The `react` app in TypeScript | You build a React app in TypeScript |
| `domains-ts` | Commands, a job and modules, with the logic split into domain folders and React as a thin layer | You build an app with more than one feature and want the logic off the UI |
| `vue-ts` | The `react-ts` app in Vue 3, with `watchEmitter` and `useEventRef` from `nanoeffects/vue` | You build a Vue 3 app |
| `svelte-ts` | The `react-ts` app in Svelte 5, with `eventStore` from `nanoeffects/svelte` | You build a Svelte app |

```bash
npm create nanoeffects@latest my-app -- --template react
```

In the `react` templates, `useEventState` keeps the found items in the component. It is not a global store: another component gets its own copy. To share a value between components, use a state manager and see [Stores](stores.md).

The TypeScript templates are the same apps with the same files, written in `.ts` and `.tsx`. Events are made with `createAction<Payload>`, so handlers and `useEventState` get their types from the events, with no annotation in the component. `npm run build` type-checks the project (`tsc --noEmit`) before bundling it.

```bash
npm create nanoeffects@latest my-app -- --template react-ts
```

### Start with Vue

`vue-ts` is the search app of `react-ts` in Vue 3 with `<script setup lang="ts">`. Its bus uses `vuePlugin` from `nanoeffects/vue`: `watchEmitter` sends the query to the bus when it changes, and `useEventRef` keeps the result of the search in a `ref`. Like `useEventState` in React, `useEventRef` is [not a store](vue.md#it-is-not-a-store): a value that several components share belongs in a store such as Pinia.

```bash
npm create nanoeffects@latest my-app -- --template vue-ts
```

`npm run build` type-checks the `.vue` files with `vue-tsc`, which needs TypeScript 5: the template depends on it.

### Start with Svelte

`svelte-ts` is the search app of `react-ts` in Svelte 5. Its bus uses `sveltePlugin` from `nanoeffects/svelte`: `eventStore` makes a Svelte store from an event. In a component, `$found` reads it, and Svelte subscribes and unsubscribes for you. The query goes to the bus from the `oninput` handler, so nothing is emitted when the component mounts. The store listens only while something reads it, and is [not a store of the app](svelte.md#it-is-not-a-store-of-the-app): a value that several components share belongs in a store of your own.

```bash
npm create nanoeffects@latest my-app -- --template svelte-ts
```

`npm run build` type-checks the `.svelte` files with `svelte-check`, which needs TypeScript 5: the template depends on it.

### Start with domains

`domains-ts` is not the search box of the other templates grown in TypeScript: it shows where logic goes when an app has several features. Each domain is a folder under `src/domains/`. It has the events of the domain, the work that handles them, and a module that mounts the work. The React components only emit events and read values.

```bash
npm create nanoeffects@latest my-app -- --template domains-ts
```

| Path | Job |
| ---- | --- |
| `src/bus.ts` | Creates the bus. It imports no events and no domain. |
| `src/app.ts` | Mounts the domains with `modulePlugin`. |
| `src/domains/catalog/` | Searching products: `catalog.ts` (events and a command), `catalog-handlers.ts` (`debounce` and `latest`), `catalog-module.ts`. |
| `src/domains/checkout/` | Placing an order: `checkout.ts` (a job), `checkout-handlers.ts` (`leading` and `retry`), `checkout-store.ts` (state written from the job's outcomes), `checkout-module.ts`. |
| `src/ui/` | The components. None of them calls the fake server in `src/api.ts`. |

For a bigger example, a chat in which parts react to each other, see [Build a chat with entities, features, modules and a small server](chat-example.md). It has more layers than `domains-ts`: when domains must react to each other, it keeps them from importing each other by splitting them into entities and features.

The commands, jobs and modules themselves are explained in [Actions, jobs and modules](actions.md). The template keeps found products in a Context provider with one `useEventState`, and the order state in a store of its own: `useEventState` is [not a store](react.md#show-the-last-value-of-an-event-as-state).

## Read the files

Every template except `domains-ts` splits the code the way [the guide](guide.md) does: one job per file. In the TypeScript templates the files end in `.ts` (and `.tsx` for React components, `.vue` for Vue components, `.svelte` for Svelte components).

| File | Job |
| ---- | --- |
| `src/bus.js` | Creates the bus. It imports no events. |
| `src/search.js` | Names the events with `createAction`. It imports no bus. |
| `src/search-handlers.js` | Handles the events with `debounce` and `latest`. It knows the bus and the events. |
| `src/api.js` | A fake server. Replace it with your own requests. |

Every call of nanoeffects in these files has a comment that says what it does. To make it your own, replace `src/api.js`, then rename the events and the handler.

## Next steps

- [Policies](policies.md): `leading`, `throttle` and `queue` next to `latest`.
- [Build a sign-up form in React](react.md): the same ideas in a bigger React example.
- [Package entries](package.md): which import holds what.
