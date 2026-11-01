# nanoeffects в приложении на TypeScript из многих файлов

> **Уровень D.** Сначала прочитайте: [Руководство](guide.md#10-добавьте-типы-когда-нужна-проверка-необязательно).

Обработчики и модули лежат в разных файлах. Как написать action с обработчиком, чтобы TypeScript вывел нагрузку и результат, и что добавить, когда обработчикам нужны поля шины (`ctx.store`, эффекты из `effectsPlugin`). Для одного файла и для JavaScript не нужно.

## Напишите action вместе с его обработчиком

Нагрузка берётся из аннотированного параметра, результат — из тела; обобщение писать не надо.

<!-- docs-check: skip - файл из examples/typescript, проверяется типами там -->
```ts
// user.ts
import { createAction, createModule } from "nanoeffects/actions";

export type User = { id: string; name: string };

// нагрузка: string, из `id: string`; результат: Promise<User>, из тела
export const getUser = createAction(
  "user/get",
  async (id: string, { signal }) => {
    const response = await fetch(`/api/users/${id}`, { signal });
    const user: User = await response.json();
    return user;
  },
);

// createModule: m.use привязывает обработчик, который несёт action, пока модуль подключён
export const userModule = createModule("user", (m) => {
  m.use(getUser);
});
```

Подключите модуль там, где создаёте шину. Результат типизируется по обработчику:

<!-- docs-check: skip - файл из examples/typescript, проверяется типами там -->
```ts
// main.ts
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { getUser, userModule } from "./user";

const bus = createBus();
const app = bus.use(modulePlugin([userModule])); // подключает модули

const user = bus.emit(getUser("1")); // Promise<User>
```

Что аннотировать и почему:

| Часть | Аннотировать? | Почему |
| ----- | ------------- | ------ |
| нагрузка (`id: string`) | да | у параметра функции нет типа, из которого можно вывести |
| `ctx` | нет, для `signal` и полей, которые есть у каждой задачи | `signal`, `emit`, `on` и `run` есть на каждом `ctx` |
| результат | нет | выводится из тела |

Неверная нагрузка при вызове (`getUser(1)`) — ошибка. Аннотируйте параметры, а не переменную: тип на всей переменной, например `const handler: Task<string, Events> = …`, фиксирует тип функции, и результат становится `unknown`.

## Дайте `ctx` поля вашей шины

Типы шины живут на шине. `contextPlugin({ store })` и `effectsPlugin({ race })` делают `ctx.store` и `ctx.race` известными обработчикам **этой шины**. Action с обработчиком, созданное в другом файле, шины не видит, поэтому на его `ctx` нет `store`:

<!-- docs-check: skip - намеренно показывает ошибку -->
```ts
export const getUser = createAction("user/get", (id: string, ctx) => {
  ctx.store; // ошибка: Property 'store' does not exist
});
```

Во время выполнения шина всё равно даёт задаче её поля, не знает об этом только проверка типов. Назовите типы шины один раз в файле, который её создаёт. `contextPlugin` берёт тип каждого поля из переданного значения, поэтому карта событий описывает только события. `EventsOf` читает из шины карту событий вместе с полями, добавленными плагинами. Код этого раздела лежит в [`examples/typescript-context`](../../examples/typescript-context).

<!-- docs-check: skip - файл из examples/typescript-context, проверяется типами там -->
```ts
// bus.ts
import { type Context, createBus, type EventsOf } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { contextPlugin } from "nanoeffects/context";
import { effectsPlugin, race } from "nanoeffects/effects";

// Events: имя события → нагрузка; о ctx здесь ничего не пишется
type Events = { "user/loaded": User };

export const bus = createBus<Events>()
  .use(contextPlugin({ store })) // ctx.store, тип выводится из значения `store`
  .use(effectsPlugin({ race })); // ctx.race; каждый плагин возвращает ту же шину, типизированную своими полями

// приложение шины: подключает модули и создаёт их с типами шины
export const app = bus.use(modulePlugin()); // модулей пока нет: их подключает main.ts
export const { createModule } = app; // createModule с типами шины

export type AppEvents = EventsOf<typeof bus>; // карта событий и все поля ctx
export type AppContext = Context<AppEvents>; // ctx обработчика этой шины: есть store и race
```

| Тип | Что это | Зачем его называть |
| --- | ------- | ------------------ |
| `EventsOf<typeof bus>` | карта событий шины с полями контекста плагинов (и `WithContext`, если вы его используете) | источник для `AppContext` |
| `Context<AppEvents>` | `ctx`, который получает обработчик шины | аннотируйте `ctx` обработчика, переданного в `createAction` |

Эти типы ничего не меняют во время выполнения. Они лишь сообщают проверке типов то, что шина уже делает.

Аннотируйте `ctx` через `AppContext` там, где обработчик читает поле шины, и создавайте модуль через `createModule`, который экспортирует `bus.ts`, чтобы обработчики его `m.on` тоже видели поля:

<!-- docs-check: skip - файл из examples/typescript-context, проверяется типами там -->
```ts
// user.ts
import { createAction } from "nanoeffects/actions";
import { type AppContext, createModule } from "./bus";

export const getUser = createAction(
  "user/get",
  (id: string, { store, signal }: AppContext) => store.fetchUser(id, { signal }),
);

// createModule из bus.ts: обработчики модуля видят поля контекста шины
export const userModule = createModule("user", (m) => {
  m.use(getUser);
  m.on("user/loaded", (user, { store }) => store.remember(user));
});
```

<!-- docs-check: skip - файл из examples/typescript-context, проверяется типами там -->
```ts
// main.ts: модули подключаются здесь, потому что файлам модулей нужен `app`
import { app, bus } from "./bus";
import { getUser, userModule } from "./user";

const unmount = app.mount(userModule); // запускает модуль; unmount() его отменяет
const user = bus.emit(getUser("1")); // Promise<User>
```

`createModule` приложения только создаёт модуль: он его не подключает и не хранит связи с шиной. Поэтому приложение в `bus.ts` стартует без модулей. `createModule` из `nanoeffects/actions` остаётся для модуля, созданного без шины: там карту событий вы пишете сами, `createModule<AppEvents>("user", …)`.

## Типизируйте функцию, принимающую сигнал

Функция, которая делает запрос, должна принимать `signal` задачи, тогда прерывание задачи отменит запрос. `WithSignal` — тип такого параметра: объект с `signal`. Как `WithContext`, он нужен только для проверки типов и в бандл ничего не добавляет.

```ts
import type { WithSignal } from "nanoeffects";

// WithSignal — { signal: AbortSignal }; ему подходит контекст задачи и просто { signal }
const search = (query: string, { signal }: WithSignal) =>
  fetch(`/search?q=${encodeURIComponent(query)}`, { signal });
```

Передавайте `ctx` (или `{ signal }`) при вызове. Эффекты из `nanoeffects/effects` (`retry`, `timeout`, `all`) вместо этого принимают необязательный сигнал, потому что вне задачи можно передать `{}`; это другой тип, и писать его не нужно.

## Держите контракт отдельно от кода

Если файл с action не должен импортировать код, который его реализует, создайте action без обработчика. Нагрузку и результат вы пишете один раз как `Call`, а обработчик уходит в модуль, где аннотации ему не нужны. `Call` — ваше обещание: ничто не сверяет его с обработчиком, поэтому держите обработчик в модуле типизированным по нему:

<!-- docs-check: skip - фрагмент файла выше -->
```ts
export const getUser = createAction<Call<string, Promise<User>>>("user/get"); // контракт

createModule("user", (m) => {
  // нагрузка и результат берутся из Call, ctx — из приложения: аннотации нет
  m.handle(getUser, (id, { store, signal }) => store.fetchUser(id, { signal }));
});
```

Неверная нагрузка, неверное поле `ctx` и неверный результат — ошибки.

## Частые ошибки

- **Поля нет на `ctx`.** `ctx` обработчика, переданного в `createAction`, не аннотирован: добавьте `: AppContext`. Обработчику, написанному прямо в `m.handle` или `m.on` модуля, созданного через `createModule` из `bus.ts`, это не нужно. У `ctx` по умолчанию полей вашей шины нет.
- **`EventsOf<typeof bus>` равен `never`.** `bus` — не шина. `bus.use(actionsPlugin())` и `bus.use(modulePlugin(...))` возвращают реестр или приложение, а не шину: держите шину в её собственной константе (`bus`, затем `app = bus.use(modulePlugin())`).
- **`effectsPlugin` нет в типе.** `use` должен идти раньше, чем вы читаете `typeof bus`. Стройте цепочку `createBus(...).use(effectsPlugin(...))` в одной привязке.
- **Политика теряет типы.** Нет: `latest(handler)` сохраняет нагрузку, результат и контекст `handler`.
- **Не передавайте контекст обобщением `createAction`.** Это четвёртый параметр обобщения формы с обработчиком, после нагрузки, результата и строки типа, так что пришлось бы писать все четыре. Аннотируйте `ctx` через `AppContext` или положите обработчик в модуль, созданный через `createModule` из `bus.ts`.
