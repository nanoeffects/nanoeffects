# Руководство

> **Уровни A–D.** Сначала прочитайте: [README](../../README.md) (установка и первый пример).

Поднимайтесь по одному шагу: небольшая шина → политики → эффекты → обработчики и модули. Остановитесь, когда в проекте есть всё нужное. Сначала установите пакет: `npm install nanoeffects` (подробности в [README](../../README.md#install)). Уровни A–D описаны на [карте документации](README.md#лестница-от-a-до-f).

| Уровень | Ваш проект | Остановиться после |
| ------- | ---------- | ------------------ |
| A | Виджет / прототип | §1–2 |
| B | SPA с async UI | §3–4 |
| C | Ненадёжная сеть / длинные сценарии | §5–6 |
| D | Доменная логика вне UI | §7–9 |

Запускаемый код каждого шага: [`examples/guide.ts`](../../examples/guide.ts).

## На этой странице

- [1. Создайте шину](#1-создайте-шину)
  - [Слушайте каждое событие](#слушайте-каждое-событие)
  - [Выбирайте события функцией](#выбирайте-события-функцией)
- [2. Используйте контекст обработчика](#2-используйте-контекст-обработчика)
- [3. Прерывайте предыдущий запуск через `latest`](#3-прерывайте-предыдущий-запуск-через-latest)
- [4. Выберите другую политику, если наложение другое](#4-выберите-другую-политику-если-наложение-другое)
- [5. Добавьте retry и timeout](#5-добавьте-retry-и-timeout)
- [6. Запускайте работу параллельно или ждите события](#6-запускайте-работу-параллельно-или-ждите-события)
- [7. Называйте события тремя способами](#7-называйте-события-тремя-способами)
- [8. Привяжите обработчик к действию позже](#8-привяжите-обработчик-к-действию-позже)
- [9. Подключите домен как модуль](#9-подключите-домен-как-модуль)
- [10. Добавьте типы, когда нужна проверка (необязательно)](#10-добавьте-типы-когда-нужна-проверка-необязательно)
- [11. Изолируйте ошибки и предупреждайте об опечатках](#11-изолируйте-ошибки-и-предупреждайте-об-опечатках)
- [Что дальше](#что-дальше)

## 1. Создайте шину

`on` подписывает. `emit` вызывает подписчиков. `on` возвращает функцию отписки.

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

Ещё четыре вызова покрывают почти всё, что нужно от самой шины:

- `bus.once(event, handler)` как `on`, но обработчик срабатывает не больше одного раза (его снимают до вызова).
- `bus.off("greet")` снимает всех слушателей этого события.
- `bus.off()` без аргументов снимает **всех** слушателей шины, включая `"*"`. `ctx.off` — тот же `off`, что и у шины, поэтому `ctx.off()` тоже очищает всю шину.
- `bus.get("greet")` отдаёт слушателей, которые у события есть сейчас, так что `bus.get("greet").length === 0` значит, что никто больше не слушает. `"*"` отдаёт слушателей любого события; именованное событие их не включает; `bus.get()` без имени отдаёт всех слушателей всех событий. Метод принимает имя события строкой: для создателя действия используйте `creator.type`.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

// once — сработает не больше одного раза, затем отписка
bus.once("ready", () => console.log("ready"));
bus.emit("ready"); // ready
bus.emit("ready"); // никто не слушает

bus.on("tick", () => {});
bus.off(); // снять все подписки
```

### Слушайте каждое событие

Вы можете пропустить этот и следующий раздел при первом чтении.

`bus.on("*", fn)` срабатывает на каждое событие шины. Это для логирования, отладки или пересылки событий в другое место. Обработчик, как обычно, получает полезную нагрузку и контекст задачи, а `ctx.type` — имя события.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

// "*" — срабатывает на каждое событие, после слушателей этого события
const unbind = bus.on("*", (payload, ctx) => {
  console.log(ctx.type, payload);
});

bus.emit("greet", "Ada"); // greet Ada
bus.emit("moved", { x: 1, y: 2 }); // moved { x: 1, y: 2 }
unbind();
```

- Событие, которое слушает только `"*"`, считается услышанным, поэтому `onUnhandled` для него не срабатывает.
- `bus.off("*")` снимает всех слушателей `"*"`; `bus.off()` очищает всю шину, `"*"` тоже.

### Выбирайте события функцией

Это для уровня B и выше. Чтобы слушать группу событий, например все `user/*`, подходят `"*"` и проверка `ctx.type`, но проверку приходится писать самому. `matchPlugin` позволяет передать в `on` функцию, которая выбирает события. Функция получает `{ type, payload }` каждого события, и обработчик срабатывает, когда она возвращает true.

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

// функция выбирает события; обработчик получает нагрузку и контекст каждого
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

- `once(fn, handler)` ждёт первое событие, которое принимает `fn`. `off(fn)` снимает все обработчики `fn`, а `off(fn, handler)` — один.
- Создатель действия по-прежнему означает именно это одно событие: функцией, выбирающей события, считается только функция без `type`.
- Цена: обработчик слушает `"*"`, поэтому каждое событие создаёт по одной задаче на каждую такую подписку, и когда функция отвечает «нет» тоже, а событие, которое слушает только такая подписка, считается услышанным для `onUnhandled`. Для нескольких известных событий дешевле `on(creator, handler)`.
- Работает в любом порядке с другими плагинами, включая `devPlugin`.

В TypeScript функция, являющаяся охранником типа (type guard), сужает тип нагрузки обработчика:

```ts
import { bus } from "./bus";

type User = { id: string };

// охранник говорит, какое это событие, и обработчик получает его нагрузку с типом
const isLoaded = (action: {
  type: string;
  payload: unknown;
}): action is { type: "user/loaded"; payload: User } => action.type === "user/loaded";

bus.on(isLoaded, (user) => console.log(user.id)); // user: User
```

`ctx.on` тоже принимает такую функцию во время выполнения, но его тип её пока не знает.

## 2. Используйте контекст обработчика

Второй аргумент — контекст **задачи** для этого вызова. Через него отправляйте дальнейшие события. Передавайте `ctx.signal` в `fetch`, когда отменяете работу.

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

## 3. Прерывайте предыдущий запуск через `latest`

Обработчик часто вызывают снова, пока прошлый вызов не закончился (набор текста, двойные клики). **Политика** оборачивает обработчик и решает, что тогда делать. Начните с `latest`: новый вызов прерывает старый через `signal`.

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

## 4. Выберите другую политику, если наложение другое

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

Все параметры: [Политики](policies.md). Нет шины? Политика работает и как обычная функция: [Политика без шины](policies.md#политика-без-шины).

## 5. Добавьте retry и timeout

**Эффект** добавляет то, что обычно нужно async-обработчику. `retry` и `timeout` оборачивают обработчик, как политика, поэтому идут в `on` без `ctx` в аргументах.

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

Когда сам обработчику нужен результат, `ctx.run` запускает обёрнутую функцию как дочернюю задачу (она прерывается вместе с родителем):

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

Для одного вызова в середине тела: `await retry(ctx, () => api.search(q, { signal: ctx.signal }))`. Подробнее в [Эффектах](effects.md).

## 6. Запускайте работу параллельно или ждите события

```js
import { createBus } from "nanoeffects";
import { all, delay, race, take } from "nanoeffects/effects";

const bus = createBus();

// all — запуск вместе; одна ошибка отменяет остальные
// child — контекст этого стартера: в нём есть `signal`, поэтому запрос останавливается вместе с группой
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

## 7. Называйте события тремя способами

`emit` и `on` принимают строку, объект `{ type, payload }` (подойдёт Redux-действие) или функцию со свойством `type` (создатели действий и действия).

Отсюда шина лежит в одном файле, а события — в файлах по имени домена (`move.js`, `math.js`), как в настоящем приложении: так события можно импортировать где угодно, не импортируя шину.

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

В простом случае используйте строки. Объекты — когда другой код уже строит действия. Дайте `createAction` обработчик, когда нужен результат от `emit`.

## 8. Привяжите обработчик к действию позже

Действие может нести свой обработчик, как `double` выше, или получить его позже из реестра: из другого файла или из подделки в тесте. Действие без обработчика остаётся событием, пока ему не привяжут обработчик.

```js
// user.js
import { createAction } from "nanoeffects/actions";

export const getUser = createAction("user/get"); // обработчика пока нет: событие
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { actionsPlugin } from "nanoeffects/actions";

export const bus = createBus();
// actionsPlugin — реестр обработчиков для этой шины
export const actions = bus.use(actionsPlugin());
```

```js
import { bus, actions } from "./bus";
import { getUser } from "./user";

bus.emit(getUser("1")); // ничего не привязано: только событие

const unregister = actions.handle(getUser, (id) => api.user(id));
const user = await bus.emit(getUser("1"));

unregister();
```

У каждой шины свой реестр. [Модуль](#9-подключите-домен-как-модуль) может регистрировать обработчики и снимать их при размонтировании. Подробнее в [Действиях](actions.md).

## 9. Подключите домен как модуль

**Проблема.** Фича владеет на шине несколькими вещами: кто отвечает на `getUser`, кто слушает `greet`, возможно, действие, которое уже несёт обработчик. С обычными `bus.on` / `actions.handle` приходится помнить каждую отписку, когда фича уходит. Забудете одну, и слушатели копятся.

**Когда.** Доменная логика живёт на шине, вне UI, и вам нужны одно подключение и одно отключение этой фичи. Пока хватает нескольких `bus.on` верхнего уровня, модули не нужны.

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

// createModule — одна фича; имя стабильно, чтобы горячая перезагрузка могла заменить модуль
export const greeting = createModule("greeting", (m) => {
  // m.on — как bus.on, снимается автоматически при размонтировании
  m.on("greet", (name) => console.log(`hello ${name}`));

  // m.handle — пока модуль подключён, он отвечает на getUser
  m.handle(getUser, (id) => api.user(id));

  // m.use — зарегистрировать действие, у которого уже есть обработчик, на время жизни модуля
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
app.unmount(greeting); // слушатель greet и привязка getUser сняты
```

- **`m.on`**: та же работа, что у `bus.on`, но на время жизни модуля.
- **`m.handle`**: привязывает обработчик к действию, у которого его нет; при размонтировании исчезает.
- **`m.use`**: подключает действие, которое уже несёт обработчик (или подмодуль). Если обработчик должен умереть вместе с фичей, лучше `handle`.

Модули же делают рабочей [горячую перезагрузку](hmr.md). Полный API в [Действиях](actions.md); рецепт подлиннее в [`examples/modules.ts`](../../examples/modules.ts).

## 10. Добавьте типы, когда нужна проверка (необязательно)

Опишите события один раз, если хотите, чтобы `on` / `emit` проверялись. Событие без данных — `void`. Пока вы изучаете шину, пропустите это.

```ts
import { createBus } from "nanoeffects";

// Events — имя события → нагрузка для этой шины (только для проверки типов)
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

Без карты разрешено любое строковое событие, а нагрузка имеет тип `unknown`.

## 11. Изолируйте ошибки и предупреждайте об опечатках

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
