# Выберите точку входа пакета

> **Уровни A–F.** Сначала прочитайте: [README](../../README.md).

Импорты разделены, чтобы загружать только то, что вы используете. `createBus` остаётся маленьким; остальное — другая точка входа.

## Начните с этих трёх

| Импорт | Что внутри |
| ------ | ---------- |
| `nanoeffects` | `createBus`, типы |
| `nanoeffects/policies` | `latest`, `leading`, `debounce`, `throttle`, `queue` |
| `nanoeffects/effects` | `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `effectsPlugin` |

## Добавляйте остальное, когда нужно

Каждая строка необязательна. Столбец «Когда» говорит, какая потребность приводит вас к ней.

| Импорт | Что внутри | Когда |
| ------ | ---------- | ----- |
| `nanoeffects/actions` | `createAction`, `createJob`, `createModule`, `modulePlugin`, `actionsPlugin` | `emit` должен вернуть результат или доменная логика уходит из UI |
| `nanoeffects/match` | `matchPlugin`: `on`, `once` и `off`, принимающие функцию, которая выбирает события | `on` должен принимать функцию, выбирающую события |
| `nanoeffects/context` | `contextPlugin`: ваши собственные поля (стор, клиент) на `ctx` каждой задачи, с типами по значению | стор или клиент должен быть на каждой задаче |
| `nanoeffects/signal` | `signalPlugin`: `emit(call, { signal })` привязывает задачи этого `emit` к внешнему `AbortSignal` | внешний `AbortSignal` (запрос, React Query) должен останавливать задачи |
| `nanoeffects/oop` | `Emitter`, `extendBus`, `WithBus`, `On`, `Once`, `disposeBus`: методы шины на классе, подписки каждого экземпляра заканчиваются через `dispose()` | вы пишете классы, а не функции |
| `nanoeffects/scope` | `scopePlugin`, `effect`: поля для одного действия, задачи, модуля или `emit` (типы `Scope`, `Effect`) | одному действию или модулю нужны свои поля |
| `nanoeffects/redux` | `createEffectsMiddleware` | вы уже используете Redux |
| `nanoeffects/observable` | `createObserve`, `Subject` | нужен Observable (RxJS) |
| `nanoeffects/react` | `reactPlugin`: добавляет хук `useEmitter` на шину (нужен React 18 или новее) | компоненты React |
| `nanoeffects/svelte` | `sveltePlugin`: добавляет `eventStore` на шину (нужен Svelte 5 или новее) | компоненты Svelte |
| `nanoeffects/vue` | `vuePlugin`: добавляет `watchEmitter` и `useEventRef` на шину (нужен Vue 3.3 или новее) | компоненты Vue |
| `nanoeffects/dev` | `devPlugin` (в production ничего не делает) | вы ищете утечки при разработке |
| `nanoeffects/trace` | `createTracer`, логгеры и `tracePlugin` (имена для трассировки) | хотите видеть, что выполнилось и почему |

Имена `...Plugin` выше используются через `bus.use`. [Плагины](plugins.md) перечисляют их все, что каждый возвращает и в каком порядке их подключать.

## Дайте документацию ИИ-ассистенту

Пакет поставляется с текстовыми файлами для ассистентов, которые пишут код с его помощью:

- `llms.txt`: короткий указатель. Он перечисляет правила, в которых сгенерированный код часто ошибается, и ссылается на каждую страницу этой документации.
- `llms-full.txt`: тот же обзор, за которым следует текст каждой связанной страницы, в одном файле.
- `skills/nanoeffects/SKILL.md`: навык (skill) для ассистентов, которые их поддерживают (например, Claude Code). В нём сказано, когда предлагать nanoeffects, когда не предлагать, и те же правила. Скопируйте папку в `.claude/skills/` вашего проекта или в `~/.claude/skills/`.

Найдите их в `node_modules/nanoeffects/` или загрузите `llms-full.txt` с CDN, например `https://unpkg.com/nanoeffects/llms-full.txt`. Все они соответствуют установленной версии. Файлы написаны на английском.
