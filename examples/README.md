# Examples

Run nanoeffects in a browser tab, or read a small recipe for one job. Start with a playground if you want to see what a policy does; open a recipe when you need the wiring for your own app.

## Try it in the browser

All three playgrounds are the same search box: type fast and only one request starts (`debounce`); type again while a request runs and the older one is aborted (`latest`). No install: StackBlitz runs them.

| Playground | What is in it | Open |
| --- | --- | --- |
| [`playground`](playground) | Plain DOM and `main.ts`. The smallest setup; the page lists the requests, so the abort is visible. | [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground) |
| [`playground-react`](playground-react) | The same search in a React component, with the bus outside React. Every task is printed to the browser console. | [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground-react) |
| [`playground-devtools`](playground-devtools) | The same search with its tasks sent to Redux DevTools. Redux DevTools is a browser extension: open the preview in its own tab and pick the instance named `search playground` in its list. | [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground-devtools) |

To run one on your machine:

```bash
cd examples/playground-react
npm install
npm run dev
```

## Recipes

Each file is one job, written as a short program with comments on every nanoeffects call. The docs page explains the idea; the file is the code that the project type-checks.

| File | Job | Docs |
| --- | --- | --- |
| [`search.ts`](search.ts) | A search box that waits for quiet and aborts the older request. | [Policies](../docs/policies.md) |
| [`backoff.ts`](backoff.ts) | Retry a flaky request with a growing pause. | [Effects](../docs/effects.md#back-off-between-retries) |
| [`registration-form.ts`](registration-form.ts) | A sign-up form: a username check that does not race, a submit that cannot fire twice. | [React form](../docs/react.md) |
| [`scope.ts`](scope.ts) | A command with its own effects, and a test that replaces one of them for a single call. | [Scopes](../docs/scope.md) |
| [`modules.ts`](modules.ts) | Domain logic with no UI, mounted and unmounted as one unit. | [Actions](../docs/actions.md) |
| [`redux.ts`](redux.ts) | Redux Toolkit actions that also reach the bus. | [Stores](../docs/stores.md) |
| [`guide.ts`](guide.ts) | The code of every step of the guide. | [Guide](../docs/guide.md) |

## TypeScript projects

Two small projects with several files each, for the typing of a bus and its context fields. They are type-checked with the rest of the repository.

| Folder | Job | Docs |
| --- | --- | --- |
| [`typescript`](typescript) | Name the event map once and use it in modules and commands. | [TypeScript](../docs/typescript.md) |
| [`typescript-context`](typescript-context) | Give `ctx` the fields of your bus (`store`, `api`) and type them from one place. | [TypeScript](../docs/typescript.md#give-ctx-the-fields-of-your-bus) |

## Copy a recipe

The recipes are `.ts` so that `pnpm tsgo` keeps them correct. For your own project, copy the JavaScript snippets of the [docs](../docs/README.md): they have no types to remove. The files in this folder are not part of the published package.
