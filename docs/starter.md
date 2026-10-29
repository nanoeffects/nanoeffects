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

```bash
npm create nanoeffects@latest my-app -- --template react
```

The TypeScript templates are the same apps with the same files, written in `.ts` and `.tsx`. Events are made with `createAction<Payload>`, so handlers and `useEventState` get their types from the events, with no annotation in the component. `npm run build` type-checks the project (`tsc --noEmit`) before bundling it.

```bash
npm create nanoeffects@latest my-app -- --template react-ts
```

## Read the files

Every template splits the code the way [the guide](guide.md) does: one job per file. In the TypeScript templates the files end in `.ts` (and `.tsx` for components).

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
