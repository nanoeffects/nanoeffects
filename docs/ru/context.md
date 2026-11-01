# Положите собственные поля на каждую задачу

> **Уровень D.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1 и 2.

Страница нужна, когда одна зависимость (стор, клиент, логгер) требуется многим обработчикам.

## Передайте значения во время выполнения

```js
import { createBus } from "nanoeffects";

// createBus({ context }) — каждая задача получает эти поля
const bus = createBus({ context: { store } });

bus.on("save", (draft, { store }) => {
  store.put(draft);
});
```

Здесь `store` — ваш объект: стор, API-клиент, логгер, что угодно. В JavaScript этого достаточно. Поля есть у обработчиков, `ctx.run`, `ctx.on`, actions, модулей и дочерних задач эффектов и политик.

Поля библиотеки (`signal`, `emit`, `run`, …) побеждают при конфликте имён. `context` может быть функцией `(task) => fields`, когда значение зависит от задачи.

Чтобы `race`, `all`, `take` и подобные были на каждой задаче без передачи `ctx`, см. [`effectsPlugin`](effects.md#положите-выбранные-эффекты-на-ctx).

Чтобы дать поля **одному** action, задаче или модулю либо заменить их для одного `emit`, см. [области (scope)](scope.md).

## Типизируйте поля (необязательно)

В TypeScript `contextPlugin` (из `nanoeffects/context`) добавляет поля в каждую задачу **этой** шины и берёт их типы из переданного значения. Карта событий описывает только события. Она ничего не связывает в приложении: у другой шины могут быть другие поля или никаких.

```ts
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";

// Events — имя события → нагрузка
type Events = { save: Draft };

// contextPlugin — каждая задача получает ctx.store; тип — это тип `store`
const bus = createBus<Events>().use(contextPlugin({ store }));

bus.on("save", (draft, { store }) => store.put(draft));
```

- Функция `(task) => fields` делает поля для каждой задачи отдельно. Она получает `{ type, payload }`.
- Несколько вызовов `contextPlugin`, `effectsPlugin` и параметр `context` в `createBus` добавляют свои поля в один и тот же контекст.
- Повтор имени, которое у шины уже есть, — ошибка типов. Поля библиотеки (`signal`, `emit`, `run`, …) побеждают во время выполнения, а уже существующее поле контекста не заменяется.
- Плагин возвращает ту же шину, поэтому сохраняйте результат цепочки: `const bus = createBus().use(contextPlugin({ store }))`.

## Постройте поле из сигнала каждой задачи

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

### Назовите поля в карте событий

`createBus<Events>({ context: { store } })` тоже типизирует поля, но через карту событий. `WithContext` нужен только для проверки типов: он говорит, какие поля есть у обработчиков этой шины. Берите его, когда `use` вызвать нельзя, например для шины, которую создаёт `createEffectsMiddleware`.

```ts
import { createBus, type WithContext } from "nanoeffects";

// WithContext — только для проверки типов: у обработчиков есть и ctx.store
type Events = { save: Draft } & WithContext<{ store: Store }>;

const bus = createBus<Events>({ context: { store } });
```
