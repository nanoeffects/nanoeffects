# Choose a package entry

Imports are split so you only load what you use. `createBus` stays small; the rest is another entry.

| Import | What is in it |
| ------ | ------------- |
| `nanoeffects` | `createBus`, the types |
| `nanoeffects/policies` | `latest`, `leading`, `debounce`, `throttle`, `queue` |
| `nanoeffects/effects` | `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `effectsPlugin` |
| `nanoeffects/actions` | `createAction`, `createCommand`, `createJob`, `createModule`, `modulePlugin`, `commandsPlugin` |
| `nanoeffects/redux` | `createEffectsMiddleware` |
| `nanoeffects/observable` | `createObserve` |
| `nanoeffects/react` | `reactPlugin`: adds the `useEmitter` hook to a bus (needs React 18 or newer) |
| `nanoeffects/dev` | `devPlugin` (no-op in production) |
| `nanoeffects/trace` | `createTracer` and the loggers |

## Give the docs to an AI assistant

The package ships two plain-text files for assistants that write code with it:

- `llms.txt`: a short index. It states the rules that generated code often gets wrong and links to every page of these docs.
- `llms-full.txt`: the same summary followed by the text of every linked page, in one file.

Find them in `node_modules/nanoeffects/`, or load `llms-full.txt` from a CDN such as `https://unpkg.com/nanoeffects/llms-full.txt`. Both match the installed version.
