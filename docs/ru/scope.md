# Привяжите поля контекста к action, модулю или вызову

> **Уровень D.** Сначала прочитайте: [Поля контекста](context.md) и [Actions](actions.md).

Страница нужна, когда одному action нужен свой клиент, модулю — свой логгер, а тесту — своя подделка, и поле на всей шине ([поля контекста](context.md)) слишком широко.

**Scope** — обычный объект. Каждый его ключ попадает на `ctx` как есть (`cache`, `api`, `logger`), кроме `$effects`. Его функции принимают `{ signal }` первым параметром, как `retry(ctx, fn)`, и попадают на `ctx` привязанными к задаче: вы пишете `ctx.fetchJson(url)` вместо `fetchJson(ctx, url)`.

Scope вы задаёте тому, кто его использует, а вызов может его заменить. Больше ничего не меняется: обработчики по-прежнему получают `(payload, ctx)`.

## На этой странице

- [Включите scope](#включите-scope)
- [Дайте action собственные поля](#дайте-action-собственные-поля)
- [Привяжите эффект к задаче](#привяжите-эффект-к-задаче)
- [Замените поле для одного вызова](#замените-поле-для-одного-вызова)
- [Дайте action, задаче или модулю собственные поля](#дайте-action-задаче-или-модулю-собственные-поля)
- [Какое значение побеждает](#какое-значение-побеждает)
- [Сохраните обобщённый эффект обобщённым](#сохраните-обобщённый-эффект-обобщённым)
- [Типизируйте поля (необязательно)](#типизируйте-поля-необязательно)
- [Ограничения](#ограничения)

## Включите scope

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

## Дайте action собственные поля

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

## Привяжите эффект к задаче

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

## Замените поле для одного вызова

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
- Он не работает со строковой формой: в `emit("user/get", payload)` второй аргумент — это нагрузка.
- Он может заменить и `$effects`: `{ $effects: { delay: instantDelay } }`.
- Поля библиотеки (`signal`, `emit`, …) в нём игнорируются.

## Дайте action, задаче или модулю собственные поля

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

## Какое значение побеждает

Когда одно и то же поле задано в нескольких местах, побеждает самое сильное:

| Сила | Где задано |
| ---- | ---------- |
| 1 (сильнейшее) | второй аргумент `emit` |
| 2 | scope action или задачи |
| 3 | scope модуля, которому принадлежит обработчик |
| 4 (слабейшее) | шина: `createBus({ context })`, `contextPlugin`, `effectsPlugin` |

Поля библиотеки (`signal`, `abort`, `emit`, `on`, `off`, `run`, `type`, `payload`) никогда не заменяются. Имя `traceGroupId` зарезервировано: его читает трассировщик, и на `ctx` оно не попадает ([Проследите один поток](tracing.md#проследите-один-поток-через-tracegroupid)). У дочерней задачи (`ctx.run`, попытка `retry`) есть поля её родителя.

## Сохраните обобщённый эффект обобщённым

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

## Типизируйте поля (необязательно)

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

## Ограничения

- Нет плагина — нет scope: см. [Включите scope](#включите-scope).
- Полей шины нет в обработчике action, созданного через `createAction(…, scope)`, если вы не типизируете `ctx` сами; поля scope есть.
- Строковая форма `emit` scope не принимает.
- `effect(fn)` работает только как значение scope, а не как запись в `$effects`.
- Scope на action, задаче или модуле типизируется без событий шины, поэтому `take` в его `$effects` принимает любое имя события.
