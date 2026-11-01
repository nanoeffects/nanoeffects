# Руководство

> **[Уровни A–D](README.md#виды-проектов)**: от небольшого приложения до доменной логики вне UI.

Установите пакет: `npm install nanoeffects`.

| Уровень | Ваш проект | Остановиться после |
| ------- | ---------- | ------------------ |
| A | Небольшое приложение, виджет или MVP | §1–2 |
| B | SPA с async UI | §3–4 |
| C | Сложная бизнес-логика | §5–6 |
| D | Доменная логика вне UI | §7–9 |

Запускаемый код каждого шага: [`examples/guide.ts`](../../examples/guide.ts).

## На этой странице

1. [Создание шины событий](#1-создание-шины-событий)
   - [Обработчик любого события](#обработчик-любого-события)
   - [Фильтрация событий для подписки](#фильтрация-событий-для-подписки)
2. [Контекст обработчика](#2-контекст-обработчика)
3. [Прерывание предыдущих запусков](#3-прерывание-предыдущих-запусков)
4. [Другие политики: `leading`, `debounce`, `throttle`, `queue`](#4-другие-политики-leading-debounce-throttle-queue)
5. [Retry и timeout](#5-retry-и-timeout)
6. [Параллельные задачи и ожидание событий](#6-параллельные-задачи-и-ожидание-событий)
7. [Способы отправки событий](#7-способы-отправки-событий)
8. [Замена обработчика события](#8-замена-обработчика-события)
9. [Создание модулей](#9-создание-модулей)
10. [Поддержка TypeScript](#10-поддержка-typescript)
11. [Работа с ошибками](#11-работа-с-ошибками)

- [Что дальше](#что-дальше)

## 1. Создание шины событий

`on` подписывается на событие шины и возвращает функцию отписки, `emit` вызывает подписчиков события.

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // шина событий; каждый вызов обработчика — задача

const unbind = bus.on("greet", (name) => {
  console.log(`hello ${name}`);
});

bus.emit("greet", "Ada"); // hello Ada
unbind();
bus.emit("greet", "Bob"); // никто не слушает
```

Обработчики запускаются сразу, в порядке подписки.

Ещё четыре вызова закрывают почти всё, что нужно от шины:

- `bus.once(event, handler)` работает как `on`, но обработчик срабатывает только один раз.
- `bus.off("greet")` снимает все подписки на это событие.
- `bus.off()` без аргументов снимает **все** подписки шины, включая `"*"`. `ctx.off` — тот же `off`, поэтому `ctx.off()` тоже очищает всю шину.
- `bus.get("greet")` возвращает текущие подписки события; `bus.get("greet").length === 0` значит, что событие никто не слушает. `bus.get("*")` возвращает подписки на любое событие, а именованное событие их не включает. `bus.get()` без имени возвращает все подписки всех событий. Метод принимает имя события строкой: для action creator передайте `creator.type`.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

// once — сработает только один раз, затем отписка
bus.once("ready", () => console.log("ready"));
bus.emit("ready"); // ready
bus.emit("ready"); // никто не слушает

bus.on("tick", () => {});
bus.off(); // снять все подписки
```

### Обработчик любого события

`bus.on("*", fn)` срабатывает на каждое событие шины. Подходит для логирования, отладки и пересылки событий. Обработчик получает payload и контекст задачи, а `ctx.type` — имя события.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

// "*" — срабатывает на каждое событие, после подписок на это событие
const unbind = bus.on("*", (payload, ctx) => {
  console.log(ctx.type, payload);
});

bus.emit("greet", "Ada"); // greet Ada
bus.emit("moved", { x: 1, y: 2 }); // moved { x: 1, y: 2 }
unbind();
```

- Событие, которое слушает только `"*"`, считается услышанным, поэтому `onUnhandled` для него не срабатывает.
- `bus.off("*")` снимает все подписки `"*"`; `bus.off()` очищает всю шину, `"*"` тоже.

### Фильтрация событий для подписки

Группу событий, например все `user/*`, можно слушать через `"*"` и проверку `ctx.type`, но проверку нужно писать самому. `matchPlugin` позволяет передать в `on` функцию-фильтр. Она получает `{ type, payload }` каждого события, и обработчик срабатывает, когда она возвращает true.

<!-- docs-check: new -->

```js
// bus.js
import { createBus } from "nanoeffects";
import { matchPlugin } from "nanoeffects/match";

// matchPlugin — позволяет on, once и off принимать функцию, которая выбирает события
export const bus = createBus().use(matchPlugin());
```

```js
// user.js
import { createAction } from "nanoeffects/actions";

export const userLoaded = createAction("user/loaded");
export const userFailed = createAction("user/failed");
```

```js
// user-handlers.js
import { bus } from "./bus";

// функция выбирает события; обработчик получает payload и контекст каждого
bus.on(
  (action) => action.type.startsWith("user/"),
  (payload, ctx) => {
    console.log(ctx.type, payload);
  },
);
```

```js
import { bus } from "./bus";
import { userFailed, userLoaded } from "./user";

bus.emit(userLoaded({ id: "1" })); // user/loaded { id: "1" }
bus.emit("order/placed", 5); // не выбрано
bus.emit(userFailed("boom")); // user/failed boom
```

- `once(filter, handler)` срабатывает на первое подходящее событие. `off(filter)` снимает все подписки с этим фильтром, `off(filter, handler)` — одну.
- Фильтр проверяется на каждом событии шины. Если нужны всего несколько известных событий, подпишитесь на них напрямую: `on(creator, handler)` дешевле.
- Событие, на которое подписан только такой фильтр, считается услышанным для `onUnhandled`.
- Работает в любом порядке с другими плагинами, включая `devPlugin`.

В TypeScript type guard сужает тип payload обработчика:

```ts
import { bus } from "./bus";

type User = { id: string };

// type guard говорит, какое это событие, и обработчик получает его payload с типом
const isLoaded = (action: {
  type: string;
  payload: unknown;
}): action is { type: "user/loaded"; payload: User } => action.type === "user/loaded";

bus.on(isLoaded, (user) => console.log(user.id)); // user: User
```

`ctx.on` тоже принимает такую функцию во время выполнения, но его тип её пока не знает.

## 2. Контекст обработчика

Второй аргумент — контекст вызова. `ctx.emit` отправляет события из обработчика, а `ctx.signal` отменяет `fetch`: передайте его в запрос.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

bus.on("moved", ({ x, y }, ctx) => {
  if (x < 0) {
    ctx.emit("outOfBounds", { x, y });
  }
});
```

В `ctx` есть `signal`, `abort`, `emit`, `on` и `run`. Прерванная задача перестаёт отправлять события и не выдаёт результат.

## 3. Прерывание предыдущих запусков

Обработчик часто вызывают снова, пока прошлый вызов не закончился (набор текста, двойные клики). **Политика** оборачивает обработчик и решает, что делать с наложением. Начните с `latest`: новый вызов прерывает старый через `signal`.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// latest — новый запуск прерывает старый
bus.on(
  "search",
  latest(async (query, { signal }) => {
    await api.search(query, { signal });
  }),
);
```

Тот же `on`, та же форма обработчика. Подробнее в [Политиках](policies.md).

## 4. Другие политики: `leading`, `debounce`, `throttle`, `queue`

| Политика | Когда вызовы накладываются |
| -------- | -------------------------- |
| `latest` | предыдущий вызов прерывается |
| `leading` | новые вызовы отбрасываются, пока идёт один |
| `debounce` | запуск после паузы |
| `throttle` | не чаще одного раза за окно |
| `queue` | один за другим |

```js
import { createBus } from "nanoeffects";
import { debounce, latest, queue, throttle } from "nanoeffects/policies";

const bus = createBus();

// throttle — не чаще одного раза в 100 мс
bus.on("scroll", throttle(100, (position) => {
  updateScrollbar(position);
}));

// debounce — запуск после 300 мс тишины
bus.on("typed", debounce(300, (text) => {
  validate(text);
}));

// queue — одно сохранение за другим, по порядку
bus.on(
  "save",
  queue(async (draft, { signal }) => {
    await api.save(draft, { signal });
  }),
);

// вложение: дождаться тишины, затем оставить только последний поиск
const searchLatest = latest(async (query, { signal }) => {
  await api.search(query, { signal });
});
bus.on("search", debounce(300, searchLatest));
```

Все параметры: [Политики](policies.md). Нет шины? Политика работает и как обычная функция: [Вызов политики вне шины](policies.md#вызов-политики-вне-шины).

## 5. Retry и timeout

**Эффект** добавляет async-обработчику то, что ему обычно нужно. `retry` и `timeout` оборачивают обработчик, как политика, поэтому идут в `on` без `ctx` в аргументах.

```js
import { createBus } from "nanoeffects";
import { retry, timeout } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

const search = (query, { signal }) => api.search(query, { signal });

// timeout — одна попытка падает через 5 с
const searchOnce = timeout(5000, search);
// retry — до 3 попыток
const searchWithRetry = retry(searchOnce, { times: 3 });

// latest — новый введённый запрос прерывает всю цепочку повторов
bus.on("typed", latest(searchWithRetry));
```

Когда обработчику нужен результат, `ctx.run` запускает обёрнутую функцию как дочернюю задачу (она прерывается вместе с родителем):

```js
import { createBus } from "nanoeffects";
import { retry, timeout } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();
const search = (query, { signal }) => api.search(query, { signal });

bus.on(
  "search",
  latest(async (query, ctx) => {
    const load = retry(timeout(5000, search), { times: 3 });
    const items = await ctx.run(load, query); // дочерняя задача; прерывается вместе с этой
    ctx.emit("results", items);
  }),
);
```

Для одного вызова в теле обработчика: `await retry(ctx, () => api.search(q, { signal: ctx.signal }))`. Подробнее в [Эффектах](effects.md).

## 6. Параллельные задачи и ожидание событий

```js
import { createBus } from "nanoeffects";
import { all, delay, race, take } from "nanoeffects/effects";

const bus = createBus();

// all — запуск вместе; одна ошибка отменяет остальные
// child — контекст этого запроса: в нём есть `signal`, поэтому запрос останавливается вместе с группой
bus.on("search", async (id, ctx) => {
  const { user, posts } = await all(ctx, {
    user: (child) => api.user(id, child),
    posts: (child) => api.posts(id, child),
  });
  ctx.emit("loaded", { user, posts });
});

// take — ждать следующее событие с таким именем
bus.on("typed", async (query, ctx) => {
  const position = await take(ctx, "scroll");
  ctx.emit("scrolled", { query, position });
});

// race — побеждает тот, кто закончил первым, второй отменяется
bus.on("save", async (draft, ctx) => {
  const result = await race(ctx, {
    cancelled: take("cancel"), // take без ctx — ждёт следующий "cancel"
    waited: delay(1000), // delay без ctx — ждёт одну секунду
  });

  if ("waited" in result) {
    ctx.emit("saved", draft);
  }
});
```

Подробнее в [Эффектах](effects.md).

## 7. Способы отправки событий

`emit` и `on` принимают строку, объект `{ type, payload }` (подойдёт Redux-action) или функцию со свойством `type` (action creators и actions).

Дальше шина лежит в одном файле, а события — в файлах по имени домена (`move.js`, `math.js`), как в настоящем приложении. Так события можно импортировать где угодно, не импортируя шину.

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus();
```

```js
// move.js
import { createAction } from "nanoeffects/actions";

// createAction — называет событие; вызов строит { type, payload }
export const moved = createAction("moved");
```

```js
// math.js
import { createAction } from "nanoeffects/actions";

// createAction с обработчиком — emit запускает обработчик и возвращает его результат
export const double = createAction("math/double", (value) => value * 2);
```

```js
import { bus } from "./bus";
import { moved } from "./move";
import { double } from "./math";

bus.emit("moved", { x: 1, y: 2 });
bus.emit({ type: "moved", payload: { x: 2, y: 2 } });

bus.emit(moved({ x: 3, y: 2 }));
bus.on(moved, ({ x }) => console.log(x));

bus.emit(double(21)); // 42
```

В простом случае берите строки. Объекты нужны, когда другой код уже строит actions. Передайте `createAction` обработчик, когда нужен результат от `emit`.

## 8. Замена обработчика события

**Проблема.** Обработчик action лежит в файле фичи, а тесту нужна подделка, или работа принадлежит другому слою. Если положить обработчик в `createAction`, файл события окажется связан с работой.

**Что делать.** Создайте action без обработчика: это событие. Настоящий обработчик привяжите через `setHandler` при создании шины. Позже `actions.handle` привязывает новый обработчик, который главнее, пока вы его не снимете.

```js
// user.js
import { createAction } from "nanoeffects/actions";

export const getUser = createAction("user/get"); // обработчика пока нет: событие
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { actionsPlugin, setHandler } from "nanoeffects/actions";
import { getUser } from "./user";

export const bus = createBus();

// setHandler — привязывает настоящий обработчик к action
const realUser = setHandler(getUser, (id) => api.user(id));

// actionsPlugin — реестр привязанных обработчиков этой шины
export const actions = bus.use(actionsPlugin([realUser]));
```

```js
import { bus, actions } from "./bus";
import { getUser } from "./user";

const user = await bus.emit(getUser("1")); // отвечает настоящий обработчик

// actions.handle — новая привязка главнее, например подделка в тесте
const restore = actions.handle(getUser, (id) => ({ id, name: "test" }));
const fake = await bus.emit(getUser("1")); // отвечает подделка

restore(); // снова отвечает настоящий обработчик
```

У каждой шины свой реестр. [Модуль](#9-создание-модулей) может привязывать обработчики и снимать их при размонтировании. Подробнее в [Actions](actions.md#привязка-обработчика-позже).

## 9. Создание модулей

**Проблема.** Фича владеет на шине несколькими вещами: ответом на `getUser`, подпиской на `greet`, возможно, action с готовым обработчиком. С обычными `bus.on` и `actions.handle` нужно помнить каждую отписку, когда фича уходит. Забудете одну — подписки копятся.

**Когда.** Доменная логика живёт на шине вне UI, и фичу нужно подключать и отключать одним вызовом. Пока хватает нескольких `bus.on` верхнего уровня, модули не нужны.

**Что делать.** `createModule(name, setup)` описывает фичу. `bus.use(modulePlugin([…]))` подключает её. `app.unmount(module)` отменяет всё, что зарегистрировал `setup`.

```js
// user.js
import { createAction } from "nanoeffects/actions";

export const getUser = createAction("user/get"); // обработчика пока нет
```

```js
// math.js
import { createAction } from "nanoeffects/actions";

export const double = createAction("math/double", (value) => value * 2); // несёт свой обработчик
```

```js
// greeting-module.js
import { createModule } from "nanoeffects/actions";
import { getUser } from "./user";
import { double } from "./math";

// createModule — одна фича; имя стабильно, чтобы hot reload мог заменить модуль
export const greeting = createModule("greeting", (m) => {
  // m.on — как bus.on, снимается автоматически при размонтировании
  m.on("greet", (name) => console.log(`hello ${name}`));

  // m.handle — пока модуль подключён, он отвечает на getUser
  m.handle(getUser, (id) => api.user(id));

  // m.use — зарегистрировать action, у которого уже есть обработчик, на время жизни модуля
  m.use(double);
});
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { greeting } from "./greeting-module";

export const bus = createBus();
// modulePlugin — подключает модули к шине
export const app = bus.use(modulePlugin([greeting]));
```

```js
import { app, bus } from "./bus";
import { greeting } from "./greeting-module";

bus.emit("greet", "Ada"); // hello Ada
app.unmount(greeting); // подписка на greet и привязка getUser сняты
```

- **`m.on`**: та же работа, что у `bus.on`, но на время жизни модуля.
- **`m.handle`**: привязывает обработчик к action, у которого его нет; при размонтировании исчезает.
- **`m.use`**: подключает action со своим обработчиком (или подмодуль). Если обработчик должен умереть вместе с фичей, лучше `handle`.

Модули также делают возможной [hot reload](hmr.md). Полный API — в [Actions](actions.md), более длинный пример — в [`examples/modules.ts`](../../examples/modules.ts).

## 10. Поддержка TypeScript

Опишите события один раз, и `on` с `emit` начнут проверяться. Событие без данных — `void`.

```ts
import { createBus } from "nanoeffects";

// Events — имя события → payload для этой шины (только для проверки типов)
type Events = {
  greet: string;
  moved: { x: number; y: number };
  reset: void;
};

const bus = createBus<Events>();

bus.on("moved", ({ x, y }) => console.log(x + y));
bus.emit("moved", { x: 1, y: 2 });
bus.emit("reset");
// bus.emit("moved", { x: "1" }); // ошибка
// bus.emit("jumped", 1); // ошибка
```

Без `createBus<Events>` разрешено любое строковое событие, а payload имеет тип `unknown`.

## 11. Работа с ошибками

```js
import { createBus } from "nanoeffects";

const bus = createBus({
  onError: (error) => report(error), // изолировать упавшие обработчики
  onUnhandled: ({ type }) => console.warn(`nobody listens to ${type}`),
});
```

Подробнее в [Ошибках](errors.md).

## Что дальше

| Нужно | Страница |
| ----- | -------- |
| Стор или клиент на каждой задаче | [Поля контекста](context.md) |
| Redux / Zustand / MobX | [Сторы](stores.md) |
| Наблюдать за задачами | [Трассировка](tracing.md) |
| Гарантии | [Семантика](semantics.md) |
| Какой импорт | [Точки входа пакета](package.md) |
