# Работа с контекстом

> **[Уровень D](README.md#виды-проектов)**: доменная логика вне UI. Сначала прочитайте: [Руководство](guide.md#1-создание-шины-событий).

Страница нужна, когда одна зависимость (store, клиент, логгер) требуется многим обработчикам, или когда одному action, модулю или вызову нужны свои поля.

## На этой странице

- [Поля контекста](#поля-контекста)
  - [Значения во время выполнения](#значения-во-время-выполнения)
  - [Типы полей](#типы-полей)
  - [Поле, построенное из сигнала задачи](#поле-построенное-из-сигнала-задачи)
- [Scope: поля для action, модуля и вызова](#scope-поля-для-action-модуля-и-вызова)
  - [Включение scope](#включение-scope)
  - [Собственные поля action](#собственные-поля-action)
  - [Привязка эффекта к задаче](#привязка-эффекта-к-задаче)
  - [Замена поля для одного вызова](#замена-поля-для-одного-вызова)
  - [Собственные поля action, задачи и модуля](#собственные-поля-action-задачи-и-модуля)
  - [Какое значение побеждает](#какое-значение-побеждает)
  - [Обобщённый эффект](#обобщённый-эффект)
  - [Типы полей scope](#типы-полей-scope)
  - [Ограничения](#ограничения)

## Поля контекста

### Значения во время выполнения

<!-- docs-check: new -->

```js
import { createBus } from "nanoeffects";

// createBus({ context }) — каждая задача получает эти поля
const bus = createBus({ context: { store } });

bus.on("save", (draft, { store }) => {
  store.put(draft);
});
```

Здесь `store` — ваш объект: store, API-клиент, логгер, что угодно. В JavaScript этого достаточно. Поля есть у обработчиков, `ctx.run`, `ctx.on`, actions, модулей и дочерних задач эффектов и политик.

Поля библиотеки (`signal`, `emit`, `run`, …) побеждают при конфликте имён. `context` может быть функцией `(task) => fields`, когда значение зависит от задачи.

Чтобы `race`, `all`, `take` и подобные были на каждой задаче без передачи `ctx`, см. [`effectsPlugin`](effects.md#effectsplugin).

Чтобы дать поля **одному** action, задаче или модулю либо заменить их для одного `emit`, см. [области (scope)](context.md#scope-поля-для-action-модуля-и-вызова).

### Типы полей

<!-- docs-check: new -->

В TypeScript `contextPlugin` (из `nanoeffects/context`) добавляет поля в каждую задачу **этой** шины и берёт их типы из переданного значения. Карта событий описывает только события. Она ничего не связывает в приложении: у другой шины могут быть другие поля или никаких.

```ts
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";

// Events — имя события → payload
type Events = { save: Draft };

// contextPlugin — каждая задача получает ctx.store; тип — это тип `store`
const bus = createBus<Events>().use(contextPlugin({ store }));

bus.on("save", (draft, { store }) => store.put(draft));
```

- Функция `(task) => fields` делает поля для каждой задачи отдельно. Она получает `{ type, payload }`.
- Несколько вызовов `contextPlugin`, `effectsPlugin` и параметр `context` в `createBus` добавляют свои поля в один и тот же контекст.
- Повтор имени, которое у шины уже есть, — ошибка типов. Поля библиотеки (`signal`, `emit`, `run`, …) побеждают во время выполнения, а уже существующее поле контекста не заменяется.
- Плагин возвращает ту же шину, поэтому сохраняйте результат цепочки: `const bus = createBus().use(contextPlugin({ store }))`.

### Поле, построенное из сигнала задачи

<!-- docs-check: new -->

Проблема: HTTP-клиент или дескриптор базы данных должен останавливаться вместе с прерванной задачей. Без помощи каждый обработчик передаёт `ctx.signal` вручную, и один забытый вызов оставляет запрос работать.

`fromSignal(make)` из `nanoeffects/signal` помечает поле `contextPlugin` как значение, которое строится из сигнала задачи. `make` запускается не для шины, а для каждой задачи, которая читает поле, — один раз, с `ctx.signal` этой задачи.

```js
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";
import { fromSignal } from "nanoeffects/signal";
import axios from "axios";

// contextPlugin — каждая задача получает эти поля
// fromSignal — http строится из сигнала той задачи, которая читает ctx.http
const bus = createBus().use(
  contextPlugin({
    logger: console, // обычное поле: один и тот же объект для каждой задачи
    http: fromSignal((signal) => axios.create({ signal })),
  }),
);

bus.on("user/open", async (id, ctx) => {
  const response = await ctx.http.get(`/users/${id}`); // прерывается вместе с задачей
  ctx.logger.log(response.data);
});
```

- `make` запускается при первом чтении, поэтому обработчик, который никогда не использует `ctx.http`, ничего за него не платит.
- Задача, которую запускает `ctx.run`, строит своё значение из своего сигнала, так что прерывание дочерней задачи останавливает только её запросы.
- Поле не копируется через `{ ...ctx }`, и `Object.keys(ctx)` его не перечисляет. Если вы копируете контекст, сначала прочитайте `ctx.http`.
- Без `contextPlugin` маркер `fromSignal` — просто объект.

#### Поля в карте событий

`createBus<Events>({ context: { store } })` тоже типизирует поля, но через карту событий. `WithContext` нужен только для проверки типов: он говорит, какие поля есть у обработчиков этой шины. Берите его, когда `use` вызвать нельзя, например для шины, которую создаёт `createEffectsMiddleware`.

```ts
import { createBus, type WithContext } from "nanoeffects";

// WithContext — только для проверки типов: у обработчиков есть и ctx.store
type Events = { save: Draft } & WithContext<{ store: Store }>;

const bus = createBus<Events>({ context: { store } });
```

## Scope: поля для action, модуля и вызова

Страница нужна, когда одному action нужен свой клиент, модулю — свой логгер, а тесту — своя подделка, и поле на всей шине ([поля контекста](context.md)) слишком широко.

**Scope** — обычный объект. Каждый его ключ попадает на `ctx` как есть (`cache`, `api`, `logger`), кроме `$effects`. Его функции принимают `{ signal }` первым параметром, как `retry(ctx, fn)`, и попадают на `ctx` привязанными к задаче: вы пишете `ctx.fetchJson(url)` вместо `fetchJson(ctx, url)`.

Scope вы задаёте тому, кто его использует, а вызов может его заменить. Больше ничего не меняется: обработчики по-прежнему получают `(payload, ctx)`.

### Включение scope

<!-- docs-check: new -->

```js
// bus.js
import { createBus } from "nanoeffects";
import { scopePlugin } from "nanoeffects/scope";

// scopePlugin — включает scope ниже на этой шине; возвращает ту же шину
export const bus = createBus().use(scopePlugin());
```

Шина лежит в одном файле, а actions — в файлах по имени домена, поэтому следующий пример импортирует `bus` отсюда. Каждый следующий раздел держит свои `bus.js` и файл домена, как будто это отдельное приложение.

- Без `scopePlugin` scope **игнорируется**: ни ошибки, ни предупреждения. Если поля нет на `ctx`, проверьте это в первую очередь.
- Плагин работает в любом порядке с другими: scope побеждает `effectsPlugin`, `contextPlugin` и `createBus({ context })`.

### Собственные поля action

<!-- docs-check: new -->

<!-- docs-check: continue -->

```js
// user.js
import { createAction } from "nanoeffects/actions";

// createAction — третий аргумент это scope этого action
export const getUser = createAction(
  "user/get",
  (id, { api, cache }) => {
    // api и cache есть на ctx только для этого action
    return cache.get(id) ?? api.getUser(id);
  },
  { api, cache: new Map() },
);
```

```js
import { bus } from "./bus";
import { getUser } from "./user";

const user = await bus.emit(getUser("1")); // у обработчика есть api и cache
```

Подписчики `"user/get"` получают те же поля, когда action отправляется, потому что поля принадлежат вызову.

### Привязка эффекта к задаче

<!-- docs-check: new -->

Эффект — это функция с `{ signal }` первым параметром. В `$effects` он привязан к задаче, поэтому останавливается вместе с ней.

```js
// feed.js
import { createAction } from "nanoeffects/actions";
import { delay, race } from "nanoeffects/effects";

// ваш собственный эффект: первый параметр — задача (используется только её signal)
const fetchJson = (ctx, url) =>
  fetch(url, { signal: ctx.signal }).then((response) => response.json());

export const loadFeed = createAction(
  "feed/load",
  (url, { fetchJson, race, delay }) =>
    // race, delay, fetchJson — привязаны к этой задаче: аргумента ctx нет
    race({
      feed: () => fetchJson(url),
      timeout: () => delay(5000),
    }),
  // $effects — встроенные и ваши собственные функции в одном объекте
  { $effects: { fetchJson, race, delay } },
);
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { scopePlugin } from "nanoeffects/scope";

export const bus = createBus().use(scopePlugin());
```

```js
import { bus } from "./bus";
import { loadFeed } from "./feed";

const result = await bus.emit(loadFeed("/feed"));
```

- В `$effects` кладите только функции, которые принимают `ctx` первым. Обычной функции (форматтер, логгер) место в `context`.
- Функция под любым другим ключом копируется как есть; функция в `$effects` привязывается.
- `$effects` — единственное имя со смыслом. Поле `effects` — обычное поле: `{ effects: { retries: 3 } }` добавляет этот объект в `ctx`, и ничего в нём не привязывается.

### Замена поля для одного вызова

<!-- docs-check: new -->

Второй аргумент `emit` — scope для задач **этого** вызова. Так обычно подставляют тесту подделку.

```js
// bus.js
import { createBus } from "nanoeffects";
import { scopePlugin } from "nanoeffects/scope";

export const bus = createBus().use(scopePlugin());
```

```js
// user.js
import { createAction } from "nanoeffects/actions";

export const getUser = createAction(
  "user/get",
  (id, { api }) => api.getUser(id),
  { api },
);
```

```js
import { bus } from "./bus";
import { getUser } from "./user";

// настоящий api для этого вызова
await bus.emit(getUser("1"));

// второй аргумент — поддельный api, только для этого вызова
const fakeApi = { getUser: async (id) => ({ id, name: "test" }) };
await bus.emit(getUser("1"), { api: fakeApi });
```

Правила для второго аргумента:

- Он работает с вызовом action (`emit(getUser("1"), scope)`, `ctx.emit(loaded(user), scope)`).
- Он не работает со строковой формой: в `emit("user/get", payload)` второй аргумент — это payload.
- Он может заменить и `$effects`: `{ $effects: { delay: instantDelay } }`.
- Поля библиотеки (`signal`, `emit`, …) в нём игнорируются.

### Собственные поля action, задачи и модуля

<!-- docs-check: new -->

```js
// user.js
import { createAction, createJob } from "nanoeffects/actions";

// createAction — подписчики вызовов этого action получают поля
export const userLoaded = createAction("user/loaded", { store });

// createJob — scope это четвёртый аргумент, после исходов;
// обработчик и подписчики исхода получают его поля
export const loadUser = createJob(
  "user/load",
  fetchUser,
  { success: userLoaded, fail: "user/failed" },
  { logger },
);
```

```js
// audit-module.js
import { createModule } from "nanoeffects/actions";
import { userLoaded } from "./user";

// createModule — третий аргумент; всё, чем владеет модуль, получает поля:
// подписки m.on, обработчики m.handle, задачи m.spawn
export const auditModule = createModule(
  "audit",
  (m) => {
    m.on(userLoaded, (user, { logger }) => logger.info(user.id));
  },
  { logger },
);
```

Если у action-исхода (`success` или `fail`) есть свой scope, его подписчики видят поля задачи, поверх которых лежат собственные поля action; обработчик задачи видит только поля задачи.

Scope модуля действует только внутри модуля: подписчик, зарегистрированный вне модуля, его не видит.

### Какое значение побеждает

<!-- docs-check: new -->

Когда одно и то же поле задано в нескольких местах, побеждает самое сильное:

| Сила | Где задано |
| ---- | ---------- |
| 1 (сильнейшее) | второй аргумент `emit` |
| 2 | scope action или задачи |
| 3 | scope модуля, которому принадлежит обработчик |
| 4 (слабейшее) | шина: `createBus({ context })`, `contextPlugin`, `effectsPlugin` |

Поля библиотеки (`signal`, `abort`, `emit`, `on`, `off`, `run`, `type`, `payload`) никогда не заменяются. Имя `traceGroupId` зарезервировано: его читает трассировщик, и на `ctx` оно не попадает ([Проследите один поток](tracing.md#один-поток-через-tracegroupid)). У дочерней задачи (`ctx.run`, попытка `retry`) есть поля её родителя.

### Обобщённый эффект

<!-- docs-check: new -->

В `$effects` функция теряет первый параметр, и TypeScript не может сохранить при этом обобщение: `<T>(items: T[]) => T` становится `(items: unknown[]) => unknown`. JavaScript это не затрагивает. Для точного типа есть два способа.

`effect(fn)`: пометьте функцию при объявлении и кладите в scope как любое другое значение. Аннотации не нужны, поэтому редактор JavaScript тоже показывает точную подсказку.

```js
// pick.js
import { createAction } from "nanoeffects/actions";
import { effect } from "nanoeffects/scope";

// effect — помечает функцию, чтобы scope привязал её к задаче; редактор сохраняет её обобщение
const first = effect((ctx, items) => items[0]);

export const pick = createAction("pick", (items, { first }) => first(items), {
  first, // обычный ключ scope, а не запись в `$effects`
});
```

Вызывайте `effect` при объявлении функции, как выше, а не прямо в scope: TypeScript не выводит scope из обобщённого вызова внутри него.

`Effect<F>` (TypeScript): опишите, как выглядит эффект **после** привязки, и положите его в `$effects`.

```ts
import { createAction } from "nanoeffects/actions";
import type { Effect } from "nanoeffects/effects";

// First — только для проверки типов: как обработчик вызывает эффект (без ctx)
type First = <T>(items: T[]) => T;

// Effect<First> — функция принимает задачу первой, а после привязки типизируется как First
const first: Effect<First> = (ctx, items) => items[0];

const pick = createAction(
  "pick",
  (id: string, { first }) => first([id]), // string
  { $effects: { first } },
);
```

`Effect<F>` и `effect` меняют то, что видит проверка типов. Во время выполнения функция та же.

### Типы полей scope

<!-- docs-check: new -->

Обработчик action, задачи или модуля со scope видит поля scope в `ctx` с типами, выведенными из переданных значений. `WithContext` писать не нужно.

```ts
import { createAction } from "nanoeffects/actions";

type User = { id: string; name: string };

const getUser = createAction(
  "user/get",
  async (id: string, ctx) => {
    ctx.cache; // Map<string, User>, из scope ниже
    return ctx.cache.get(id);
  },
  { cache: new Map<string, User>() },
);
```

- Поле scope заменяет одноимённое поле шины и в типе тоже.
- Подмена в `emit` должна совпадать с типом заменяемого поля: `emit(getUser("1"), { cache: 1 })` — ошибка.
- У поля, которое не объявили ни scope, ни шина, нет типа для сверки, поэтому `emit(call, { unknown: 1 })` — ошибка в TypeScript.
- `bus.on(creator, fn)` для action со scope типизирует `ctx` его полями.

### Ограничения

<!-- docs-check: new -->

- Нет плагина — нет scope: см. [Включение scope](#включение-scope).
- Полей шины нет в обработчике action, созданного через `createAction(…, scope)`, если вы не типизируете `ctx` сами; поля scope есть.
- Строковая форма `emit` scope не принимает.
- `effect(fn)` работает только как значение scope, а не как запись в `$effects`.
- Scope на action, задаче или модуле типизируется без событий шины, поэтому `take` в его `$effects` принимает любое имя события.
