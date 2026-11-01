# Трассировка задач

> **[Уровень F](README.md#виды-проектов)**: платформа, SDK или долгоживущее приложение. Сначала прочитайте: [Руководство](guide.md#1-создание-шины-событий).

Трассировка показывает, что делало приложение и почему: какие события отправлялись, какие вызовы политика отменила или отбросила, какой запрос упал. Её видно в консоли браузера, в Redux DevTools и на панели Performance.

Трассировка необязательна. Шина работает так же и без неё, а пока трассировка выключена, она почти ничего не стоит. Чтобы просто видеть, что происходит при разработке, откройте [Каждый emit в трассировке](#каждый-emit-в-трассировке) и [Настройка Redux DevTools](#настройка-redux-devtools). Остальное — для приложений, которым нужно следить за потоком или убирать трассировку из сборки.

## На этой странице

- [Подключение трассировщика](#подключение-трассировщика)
- [Каждый emit в трассировке](#каждый-emit-в-трассировке)
- [Какая подписка начала цепочку](#какая-подписка-начала-цепочку)
- [Один поток через traceGroupId](#один-поток-через-tracegroupid)
- [Имя обработчика](#имя-обработчика)
- [Сохранение цепочки: `ctx.emit` вместо `bus.emit`](#сохранение-цепочки-ctxemit-вместо-busemit)
- [Отключение имён](#отключение-имён)
- [Встроенные логгеры](#встроенные-логгеры)
  - [Сокращение объёма в production](#сокращение-объёма-в-production)
  - [Последние события на случай инцидента](#последние-события-на-случай-инцидента)
  - [Настройка Redux DevTools](#настройка-redux-devtools)
  - [Поиск циклов через `graphLogger`](#поиск-циклов-через-graphlogger)
  - [Собственный логгер](#собственный-логгер)
- [Удаление трассировки из сборки](#удаление-трассировки-из-сборки)

## Подключение трассировщика

Передайте `trace` в `createBus`. Создайте его через `createTracer` из `nanoeffects/trace`, который принимает логгер (функцию) или массив логгеров. Код трассировки находится в этой точке входа, поэтому шина без `trace` его не содержит.

```js
import { createBus } from "nanoeffects";
import { createTracer } from "nanoeffects/trace";

const bus = createBus({
  // createTracer — наблюдать каждую фазу задачи
  trace: createTracer((event) => console.log(event)),
});
```

У каждого `TraceEvent` есть:

| Поле | Значение |
| ---- | -------- |
| `id` | Уникальный идентификатор задачи в пределах шины |
| `parentId` | Идентификатор задачи, которая запустила эту (у задач обработчиков отсутствует) |
| `rootId` | Идентификатор корневой задачи цепочки; у самого корня отсутствует и одинаков через обработчик, который ничего не сообщает |
| `type` | Тип события, над которым работает задача |
| `effect` | `latest`, `debounce`, `throttle`, `leading`, `run`, `all`, `race`, …; `emit` для события emit от `tracePlugin` |
| `phase` | `start`, `done`, `error`, `cancel` или `drop` |
| `payload` | Payload события |
| `error` | Выброшенное значение, только для `error` |
| `traceGroupId` | Поток задачи, если он есть у неё или у задачи выше |

Фазы:

- `start` — работа началась.
- `done` / `error` — она завершилась или выбросила ошибку.
- `cancel` — прервана после старта (вытеснена `latest`, родитель прерван, проиграла `race`).
- `drop` — так и не стартовала (`leading`, пока занято, вызов `throttle`, заменённый более новым, вызов `debounce`, заменённый до конца задержки).

`all` и `race` трассируются, когда вы передаёте им `ctx` обработчика: группа — одна задача; каждая функция группы — дочерняя задача `run`.

```js
import { createBus } from "nanoeffects";
import { all } from "nanoeffects/effects";

const bus = createBus();

bus.on("load", async (id, ctx) => {
  await all(ctx, {
    user: () => fetchUser(id),
    posts: () => fetchPosts(id),
  });
});
```

## Каждый emit в трассировке

**Когда.** Лог должен показывать всё, что отправлено, в том числе когда никто не слушает или обработчик — обычная функция. Без этого в трассировке только задачи, которые что-то сообщают: политика (`latest`, ...) или `ctx.run`.

`tracePlugin` сообщает одно событие на каждый emit, с `effect: "emit"` и `phase: "done"`, до запуска обработчиков. `type` — имя события, а `payload` — то, что было отправлено. У `ctx.emit` в качестве `parentId` стоит задача, которая отправляет.

```js
// bus.js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: отправляет каждое событие трассировки логгеру; consoleLogger: печатает по одной строке на каждое
const trace = createTracer(consoleLogger());

export const bus = createBus({ trace })
  .use(tracePlugin()); // tracePlugin: сообщает каждый emit как событие
```

```js
import { bus } from "./bus";

bus.emit("search", "nano"); // в логе: search · emit done
```

Больше это событие ничего не меняет: остальные задачи сохраняют свои `parentId`, `rootId` и `traceGroupId`. Без плагина в трассировке нет событий `emit`.

- **Что считается emit.** Каждый `bus.emit`, в том числе те, что за вас делает библиотека: job отправляет свои `pending` и `success` (или `fail`, `cancel`), так что один вызов job — несколько событий `emit`.
- **Цена.** Одна небольшая задача на каждый emit, около 60 нс на шине, у которой уже есть трассировщик (шина с трассировщиком, но без плагина: примерно на 250 нс больше, чем шина без него). `sample` и `filter` в `createTracer` сокращают это в логе, но не в работе.

## Какая подписка начала цепочку

**Проблема.** `useEmitter` и `bus.emitter` кладут событие на шину извне любой задачи, например из рендера или callback store. В трассировке у такого события нет следа его происхождения. При множестве таких подписок трудно сказать, какая из них запустила цепочку actions и повторов.

**Когда.** У шины есть трассировщик, а в проекте несколько вызовов `useEmitter` или `bus.emitter`. Имена приходят от `tracePlugin`: подключите его на шине, иначе `traceId` игнорируется.

Дайте каждому `traceId`. Если у шины есть трассировщик, emit выполняется из корневой задачи: её `type` — это `traceId`, а effect — `run`. Всё, что запускает событие, становится дочерним для этого корня. Без трассировщика ничего не меняется.

```js
import { createBus } from "nanoeffects";
import { createAction, emitterPlugin } from "nanoeffects/actions";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: сообщает каждую фазу задачи в консоль
const trace = createTracer(consoleLogger());

const bus = createBus({ trace })
  .use(tracePlugin()) // tracePlugin: создаёт корневую задачу, которую называет traceId
  .use(emitterPlugin());

const cartChanged = createAction("cart/changed");

// emitter: callback для store; traceId называет его в трассировке
const emitCartChanged = bus.emitter(cartChanged, { traceId: "cartStore" });
```

В компоненте тот же параметр передаётся в параметры хука: `useEmitter(nameChanged, name, { traceId: "Profile" })`. В консоли:

```
[nanoeffects] Profile · run start
[nanoeffects]   user/save · action start
[nanoeffects]   user/save · action done
[nanoeffects] Profile · run done
```

`traceId` — строка по вашему выбору, например имя компонента или store; держите её стабильной. Без `traceId` у корня тип события.

Две вещи, которые нужно знать:

- **`sample` видит `traceId`.** Корень эмиттера — такая же задача, как любая другая, поэтому функция `sample` получает `{ type, payload }`, где `type` — это `traceId`, а `payload` — отправленный action. Функция, которая сопоставляет тип события, например `event.type === "search"`, не выберет корень с другим `traceId`; сопоставляйте `traceId` или `payload.type`.
- **Внутри обработчика отправляйте через `ctx.emit`.** `ctx.emit` сохраняет цепочку: запущенные им задачи становятся дочерними для обработчика. Обычный `bus.emit` внутри обработчика запускает новый корень без родителя и без `rootId`, так что трассировка теряет связь.

У каждого события задачи, лежащей ниже другой, есть `rootId` — идентификатор корня цепочки, в том числе когда между ними стоит обработчик, который ничего не сообщает. `parentId` — задача непосредственно выше, и это может быть такой обработчик.

## Один поток через traceGroupId

**Проблема.** У потока вроде оформления заказа несколько корней (клик, таймер, store) и много ветвей. Идентификаторы родителей дают дерево, но вам нужно фильтровать лог по потоку.

**Когда.** Один бизнес-поток проходит через несколько actions, и вы читаете лог по потокам.

Дайте потоку `traceGroupId` в scope action или job, который его запускает. Каждая задача, которую он запускает через `ctx.emit` или `ctx.run`, получает тот же `traceGroupId`, как и каждое событие трассировки этих задач. Задача, которая объявляет собственный `traceGroupId`, использует его для себя и для того, что запускает.

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: отправляет каждое событие трассировки логгеру; consoleLogger: печатает по одной строке на каждое
const trace = createTracer(consoleLogger());

// tracePlugin: читает traceGroupId из scope вызова
const bus = createBus({ trace })
  .use(tracePlugin());

// scope называет поток; traceGroupId предназначен трассировщику, а не полю ctx
const pay = createAction("checkout/pay", async () => {}, {
  traceGroupId: "checkout",
});
```

```
[nanoeffects] [checkout] checkout/pay · action start
```

Эмиттеры его тоже принимают: `useEmitter(cartChanged, cart, { traceId: "Cart", traceGroupId: "checkout" })`. `traceGroupId` работает без `scopePlugin` и требует `tracePlugin`.

## Имя обработчика

**Проблема.** Лог показывает, что запустило цепочку и что она запустила, но обработчик события ничего не сообщает, поэтому нельзя сказать, какой из нескольких обработчиков выполнился.

**Когда.** У события больше одного обработчика, и вы читаете трассировку, чтобы увидеть, кто сделал работу.

Дайте обработчику `traceId` при регистрации. Плагин делает каждый его вызов задачей с этим именем, а то, что он отправляет через `ctx.emit`, становится дочерним. `off` работает как раньше. Это работает и в модуле (`m.on(event, handler, { traceId })`), и на экземпляре, созданном через `extendBus`.

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: отправляет каждое событие трассировки логгеру; consoleLogger: печатает по одной строке на каждое
const trace = createTracer(consoleLogger());

const bus = createBus({ trace })
  .use(tracePlugin());

// traceId: имя этого обработчика в трассировке
bus.on("name/changed", saveName, { traceId: "saveNotifier" });
bus.once("name/changed", (name) => console.log(name), { traceId: "auditLog" });
```

```
[nanoeffects] saveNotifier · run start
[nanoeffects]   user/save · action start
[nanoeffects] saveNotifier · run done
```

## Сохранение цепочки: `ctx.emit` вместо `bus.emit`

Внутри обработчика отправляйте через `ctx.emit`. Он сохраняет цепочку: запущенные им задачи становятся дочерними для обработчика, а у его событий есть `rootId` цепочки. Обычный `bus.emit` внутри обработчика запускает новый корень без `parentId` и без `rootId`, так что трассировка теряет связь. Шина не может об этом предупредить, потому что не знает, какой обработчик сейчас выполняется.

Имена работают везде, где создаётся событие или обработчик:

| Где | Как назвать |
| --- | ----------- |
| `useEmitter` и `bus.emitter` | `{ traceId, traceGroupId }` в параметрах |
| Redux dispatch | `createEffectsMiddleware(bus, { traceId, traceGroupId })` |
| Обработчик, `bus.on` и `bus.once` | `{ traceId }` третьим аргументом |
| Обработчик модуля или экземпляра `extendBus` | тот же третий аргумент его `on` и `once` |
| Метод с `@On` или `@Once` | `{ traceId }` в декораторе |
| Action или job | `traceGroupId` в его scope |

## Отключение имён

`tracePlugin` необязателен, и ничто из него не меняет работу вашего кода:

- **Без плагина** или на шине без трассировщика `traceId` и `traceGroupId` игнорируются. Обработчики выполняются как есть, с теми же результатами, ошибками и отклонениями, а `onError` видит те же ошибки.
- **Типы одинаковы** с плагином и без него, так что его можно использовать только при разработке: `if (isDev) bus.use(tracePlugin())` компилируется в обеих сборках.
- **`traceGroupId` в scope** никогда не попадает на `ctx`.

## Встроенные логгеры

Логгер — это `(event) => void`. `createTracer` принимает один логгер или массив. Логгер, который выбросил ошибку, сообщается в `console.error` и никогда не ломает задачу или другие логгеры.

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, reduxDevtools } from "nanoeffects/trace";

const bus = createBus({
  trace: createTracer([reduxDevtools({ name: "app" }), consoleLogger()]),
});
```

| Логгер | Что делает |
| ------ | ---------- |
| `reduxDevtools()` | Отправляет emit в Redux DevTools, а с `policies` — стадии обработчиков как `type/effect/phase`; state — `{ running }` |
| `consoleLogger()` | Печатает по одной строке на фазу, с отступом по глубине задачи |
| `performanceLogger()` | Измерения User Timing для панели Performance браузера |
| `graphLogger()` | Строит карту того, какое событие к какому ведёт, находит циклы во время работы приложения и записывает карту как Mermaid, Graphviz или JSON ([см. ниже](#поиск-циклов-через-graphlogger)) |
| `createTraceRecorder()` | Хранит события в `recorder.events`: все — для тестов, либо с `{ capacity }` последние N ([см. ниже](#последние-события-на-случай-инцидента)) |

### Сокращение объёма в production

```js
import { createTracer } from "nanoeffects/trace";

createTracer(logger, {
  sample: 0.05, // трассировать 5% вызовов обработчиков (доля или функция от { type, payload })
  filter: (event) => event.phase === "error", // оставить только сбои
});
```

- `sample` решается один раз на корневую задачу; каждая задача ниже следует за ней, так что трассировка никогда не обрывается посередине. Задачи вне выборки почти ничего не стоят.
- `filter` выполняется на каждом событии до того, как его увидит любой логгер.

### Последние события на случай инцидента

`createTraceRecorder()` без параметров хранит каждое событие, поэтому длинная сессия заполняет память. В тесте это нормально, а в работающем приложении — нет. Задайте `capacity`, и рекордер будет хранить только последние N событий (кольцевой буфер): когда что-то пойдёт не так, у вас останется то, что к этому привело.

<!-- docs-check: new -->

```js
// bus.js
import { createBus } from "nanoeffects";
import { createTraceRecorder, createTracer } from "nanoeffects/trace";

// Логгер, который хранит последние 500 событий и отбрасывает более старые.
export const recorder = createTraceRecorder({ capacity: 500 });

// Подайте рекордер из трассировщика.
const trace = createTracer(recorder);

export const bus = createBus({ trace });
```

```js
// incident.js
import { recorder } from "./bus";

// Оставьте то, что безопасно отправлять. У события есть ещё `payload` и `error`.
const withoutPayload = ({ id, parentId, type, effect, phase }) => ({
  id,
  parentId,
  type,
  effect,
  phase,
});

window.addEventListener("error", () => {
  const events = recorder.events; // снимок, самое старое событие первым
  const safe = events.map(withoutPayload);
  const body = JSON.stringify(safe);
  navigator.sendBeacon("/api/incident", body);
});
```

Что нужно знать, прежде чем отправлять события:

- **`payload` и `error` могут содержать приватные данные**: то, что ввёл пользователь, токены, личный текст. Рекордер хранит их как есть и не вычищает. Выбирайте, что отправлять, как это делает `withoutPayload`.
- **У события нет времени.** Вы получаете порядок, а не длительность. Чтобы добавить время, оберните рекордер в логгер, который проставляет `performance.now()` на копии события.
- **Старый `parentId` может указывать на событие, которое вытеснено.** Когда вы строите дерево из событий, считайте неизвестный `parentId` корнем.
- **`recorder.events` с `capacity` — снимок.** Каждое чтение строит новый массив, поэтому читайте его один раз в нужный момент. Без `capacity` это один живой массив.
- **Низкий `sample` разрежает буфер.** `createTracer(recorder, { sample: 0.05 })` записывает 5% корневых задач, поэтому к моменту инцидента в буфере может быть мало. См. [Сокращение объёма в production](#сокращение-объёма-в-production).
- **`capacity`, не являющийся положительным целым** (`0`, отрицательное число, `NaN`), означает «без ограничения».

### Настройка Redux DevTools

<!-- docs-check: new -->

Логгер только читает (шина не владеет state, поэтому путешествия по времени нет). Если расширение не установлено, он ничего не делает. В списке экземпляров DevTools у него своя запись, отдельная от вашего store.

По умолчанию логгер выводит мало: сначала видно, что случилось, а подробности включаются отдельно:

- **Один action на emit**, названный по событию (`search`), с его payload. Для этого нужен `bus.use(tracePlugin())` (см. [Каждый emit в трассировке](#каждый-emit-в-трассировке)); без него лог по умолчанию пуст, а логгер печатает один `console.warn`, когда заканчивается первая задача обработчика без emit перед ней.
- **Упавший обработчик** отправляется как `search/latest/error`.
- Больше ничего: ни start, ни `done`, ни стадий политик, ни эффектов.

Чтобы увидеть больше, включайте:

- `policies` — стадии задач обработчиков, как `event/policy/phase`. `true` показывает каждую фазу, список показывает эти фазы, функция получает `{ effect, phase }`.
- `starts: true` — отправлять ещё и старт каждой показываемой задачи. Выполняющиеся задачи хранятся в state `{ running }`.
- `depth: 1` — ещё и эффекты, которые запускает обработчик (`retry`, `timeout`); `depth: Infinity` — всё ниже.
- `payload` — у каких actions в событии есть payload:
  - `"essential"` (по умолчанию) — actions из emit, а также `cancel`, `drop` и `error` задачи, где payload — единственный способ понять, какой это был вызов. `start` и `done` повторяют emit и payload не имеют, так что большая payload отправляется один раз.
  - `"all"` — каждый action, как в 0.12.
  - `"none"` — ни один action. Подходит для большой payload и для данных, которые не должны попасть в расширение браузера (токены, личные данные). Тогда нельзя будет сказать, какой вызов остановила политика.
- `maxAge: 200` — сколько actions хранит DevTools (по умолчанию 50).

```js
// bus.js
import { createBus } from "nanoeffects";
import { createTracer, reduxDevtools, tracePlugin } from "nanoeffects/trace";

// reduxDevtools: отправляет трассировку в расширение; только emit и сбои
const logger = reduxDevtools({ name: "app" });

export const bus = createBus({ trace: createTracer(logger) })
  .use(tracePlugin()); // tracePlugin: создаёт события emit
```

```js
import { reduxDevtools } from "nanoeffects/trace";

// отладка гонки: какие вызовы политика отменила или отбросила?
reduxDevtools({
  name: "app",
  policies: ["cancel", "drop"],
});

// каждая стадия каждой политики, одна функция для выбора
reduxDevtools({
  name: "app",
  policies: ({ effect, phase }) => effect === "latest" && phase !== "start",
});

// старый лог: каждая стадия и эффекты под обработчиками
reduxDevtools({
  name: "app",
  policies: true,
  depth: 1,
  payload: "all",
});

// не пускать payload в расширение
reduxDevtools({
  name: "app",
  payload: "none",
});
```

При двух быстрых emit `search` и обработчике `latest` список по умолчанию — `search`, `search`. С `policies: true` к нему добавляются стадии `latest` каждого вызова, например `search/latest/cancel` для первого.

### Поиск циклов через `graphLogger`

Два обработчика, которые отправляют события друг друга, не остановятся сами. `graphLogger` — логгер, который находит такой цикл во время работы приложения, один раз пишет о нём отчёт и хранит карту событий, чтобы её можно было нарисовать.

```js
// bus.js
import { createBus } from "nanoeffects";
import { createTracer, graphLogger, tracePlugin } from "nanoeffects/trace";

// graphLogger — карта событий и поиск циклов в одном логгере
export const graph = graphLogger({ name: "app" });

// createTracer — передаёт логгеру каждую задачу шины
const trace = createTracer(graph);

// tracePlugin — тоже сообщает о каждом emit; логгер работает и без него, но карта грубее
export const bus = createBus({ trace }).use(tracePlugin());

// graph.cycles() перечисляет найденные циклы; graph.toMermaid() рисует карту
```

Он сообщает об узле, который стоит в одной цепочке три раза, о шторме emit вне обработчиков и о цепочке, которая запускает слишком много задач. Отчёт идёт в `console.warn`, в `onCycle` или, с `devtools: true`, в Redux DevTools. Ничего не останавливается: чтобы оборвать цикл, используйте [`loopGuardPlugin`](loop-guard.md). Полный разбор со сценариями, которые можно запустить, — [Поиск и обрыв циклов событий](debugging-loops.md).

### Собственный логгер

```ts
import type { TraceLogger } from "nanoeffects/trace";

const errorsOnly = (): TraceLogger => (event) => {
  if (event.phase === "error") {
    report(event.error);
  }
};
```

## Удаление трассировки из сборки

Без трассировщика хуки почти ничего не стоят. `nanoeffects/trace` попадает в бандл, только если его импортируют.

Чтобы убрать код трассировки и из ядра, включите условие экспорта `notrace`. В пакете есть вторая сборка `index`, `effects`, `policies` и `actions` с `__NANOEFFECTS_TRACE__`, равным `false`.

```js
// vite / rolldown
resolve: { conditions: ["notrace"] }
// webpack
resolve: { conditionNames: ["notrace", "import", "..."] }
// esbuild
conditions: ["notrace"]
```

В сборке из исходников `define: { __NANOEFFECTS_TRACE__: "false" }` делает то же самое. С установленным условием у типов этой сборки нет параметра `trace`: `createBus({ trace })` — ошибка типов. У `nanoeffects/trace` нет сборки `notrace`. Экономия — около 0,4 кБ gzip от всей библиотеки.
