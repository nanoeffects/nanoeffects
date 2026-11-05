# Точки входа пакета

> **[Уровни A–F](README.md#виды-проектов)**: для любого проекта.

## Три основных импорта

| Импорт | Что внутри |
| ------ | ---------- |
| `nanoeffects` | `createBus`, типы |
| `nanoeffects/policies` | `latest`, `leading`, `debounce`, `throttle`, `queue` |
| `nanoeffects/effects` | `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `effectsPlugin` |

## Остальные импорты

| Импорт | Что внутри | Когда |
| ------ | ---------- | ----- |
| `nanoeffects/actions` | `createAction`, `createJob`, `createModule`, `modulePlugin`, `actionsPlugin` | `emit` должен вернуть результат или доменная логика уходит из UI |
| `nanoeffects/match` | `matchPlugin`: `on`, `once` и `off` принимают функцию-фильтр вместо имени события | подписываться нужно по условию, а не по имени |
| `nanoeffects/context` | `contextPlugin`: ваши собственные поля (store, клиент) на `ctx` каждой задачи, с типами по значению | store или клиент должен быть на каждой задаче |
| `nanoeffects/signal` | `signalPlugin`: `emit(call, { signal })` привязывает задачи этого `emit` к внешнему `AbortSignal`; `signalFetch(ctx, url)`: `fetch`, который останавливается вместе с задачей; `fromSignal`: клиент, созданный из сигнала каждой задачи | внешний `AbortSignal` (запрос, React Query) должен останавливать задачи или обработчик не должен передавать сигнал вручную |
| `nanoeffects/oop` | `Emitter`, `extendBus`, `WithBus`, `On`, `Once`, `disposeBus`: методы шины на классе, подписки каждого экземпляра заканчиваются через `dispose()` | вы пишете классы, а не функции |
| `nanoeffects/scope` | `scopePlugin`, `effect`: поля для одного action, задачи, модуля или `emit` (типы `Scope`, `Effect`) | одному action или модулю нужны свои поля |
| `nanoeffects/redux` | `createEffectsMiddleware` | вы уже используете Redux |
| `nanoeffects/observable` | `createObserve`, `Subject` | нужен Observable (RxJS) |
| `nanoeffects/react` | `reactPlugin`: добавляет хук `useEmitter` на шину (нужен React 18 или новее) | компоненты React |
| `nanoeffects/svelte` | `sveltePlugin`: добавляет `eventStore` на шину (нужен Svelte 5 или новее) | компоненты Svelte |
| `nanoeffects/vue` | `vuePlugin`: добавляет `watchEmitter` и `useEventRef` на шину (нужен Vue 3.3 или новее) | компоненты Vue |
| `nanoeffects/dev` | `devPlugin` (в production ничего не делает), `getLostSignalsCount` и `getLostSignals` для тестов | нужно находить утечки подписок и потерянные сигналы при разработке и в тестах |
| `nanoeffects/trace` | `createTracer`, логгеры (`graphLogger` находит циклы событий; `mergeGraphs` и `findOrphans` находят подписки, до которых не дошёл ни один запуск) и `tracePlugin` (имена для трассировки) | нужно видеть, что выполнилось и почему |
| `nanoeffects/testing` | `createMarbleBus`, `fakeTimersClock`: шина для тестов, где отправки и фазы записаны диаграммами | вы тестируете `latest`, `debounce`, `queue`, `retry` или `timeout` на поддельных таймерах |
| `nanoeffects/guard` | `loopGuardPlugin`: отклоняет emit, который превысил бы предел цепочки | цикл не должен ронять приложение |

Плагины с именами `...Plugin` подключаются через `bus.use`. Страница [Плагины](plugins.md) перечисляет их все, говорит, что каждый возвращает и в каком порядке их подключать.

## Документация для ИИ-ассистентов

В пакете есть текстовые файлы для ассистентов, которые пишут код с nanoeffects:

- `llms.txt`: короткий указатель. Правила, в которых сгенерированный код часто ошибается, и ссылки на все страницы документации.
- `llms-full.txt`: тот же обзор и текст всех связанных страниц в одном файле.
- `skills/nanoeffects/SKILL.md`: навык (skill) для ассистентов с такой поддержкой, например Claude Code. Он говорит, когда предлагать nanoeffects, а когда нет, и повторяет те же правила. Скопируйте папку в `.claude/skills/` проекта или в `~/.claude/skills/`.

Файлы лежат в `node_modules/nanoeffects/`. `llms-full.txt` можно загрузить с CDN, например `https://unpkg.com/nanoeffects/llms-full.txt`. Содержимое соответствует установленной версии. Файлы написаны на английском.
