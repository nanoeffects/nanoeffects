# nanoeffects с React Query, SWR и RTK Query

> **Уровень E.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Данные приходят через [React Query](https://tanstack.com/query) (TanStack Query), [SWR](https://swr.vercel.app) или [RTK Query](https://redux-toolkit.js.org/rtk-query/overview), а `retry`, `timeout` и прерывание из nanoeffects должны работать внутри запроса. Сначала один action, который вызывают эти библиотеки, затем три рецепта: клиент, который останавливается вместе с запросом, живой поток в кэш и повторный запрос по событию шины.

Нужны проект на React, `nanoeffects` и одна из библиотек. `api` ниже — ваш клиент: замените его своими запросами.

## На этой странице

- [Решите, кто чем владеет](#решите-кто-чем-владеет)
- [Создайте action](#создайте-action)
- [Вызовите его из React Query](#вызовите-его-из-react-query)
- [Вызовите его из SWR](#вызовите-его-из-swr)
- [Сообщите шине результат](#сообщите-шине-результат)
- [Вызовите его из RTK Query](#вызовите-его-из-rtk-query)
- [Дайте клиенту его сигнал один раз](#дайте-клиенту-его-сигнал-один-раз)
- [Направьте живой поток в кэш](#направьте-живой-поток-в-кэш)
- [Перезапрашивайте запросы, когда шина так скажет](#перезапрашивайте-запросы-когда-шина-так-скажет)
- [Учитывайте ограничения](#учитывайте-ограничения)

## Решите, кто чем владеет

| React Query или SWR | nanoeffects |
| ------------------- | ----------- |
| `isLoading`, `data`, `error` | `retry`, `timeout`, `latest` и другие политики |
| кэш, один запрос на один ключ | прерывание, которое доходит до запроса |
| повторный запрос по фокусу, по переподключению, по интервалу | обработчик: один и тот же код для теста, воркера и UI |

`isLoading` и `data` берутся из библиотеки, а не из `emit`. `await bus.emit(...)` завершается один раз, с результатом, поэтому не может сообщить, что запрос ещё идёт.

## Создайте action

Action с обработчиком и есть сам запрос. Он живёт в файлах, которые ничего не знают о React: шина, action с обработчиком и компонент.

```js
// bus.js
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// createBus — шина, общая для приложения
// signalPlugin — позволяет emit принимать { signal }, сигнал библиотеки
export const bus = createBus().use(signalPlugin());
```

Обработчик делает до трёх попыток, каждая прерывается через пять секунд. `ctx.signal` — сигнал задачи: он прерывается, когда библиотека прерывает запрос.

```js
// user.js
import { createAction } from "nanoeffects/actions";
import { retry, timeout } from "nanoeffects/effects";

// createAction с обработчиком — emit возвращает то, что вернул обработчик
export const getUser = createAction("user/get", async (id, ctx) => {
  // одна попытка: запрос с сигналом timeout, чтобы тот мог его остановить
  const load = ({ signal }) => api.getUser(id, { signal });
  // timeout — провалить попытку через 5 с
  const attempt = () => timeout(ctx, 5000, load);
  // retry — до 3 попыток с паузой 500 мс
  return retry(ctx, attempt, { times: 3, delay: 500 });
});
```

## Вызовите его из React Query

<!-- docs-check: continue -->

React Query передаёт `queryFn` сигнал `signal` и прерывает его, когда запрос становится неактивным или устаревшим. Передайте его в `emit`. Задача прерывается вместе с ним, поэтому `timeout` и `retry` останавливаются, а с ними и запрос.

```jsx
// Profile.jsx
import { useQuery } from "@tanstack/react-query";
import { bus } from "./bus";
import { getUser } from "./user";

export function Profile({ id }) {
  const { isLoading, data, error } = useQuery({
    queryKey: ["user", id],
    // emit — запускает action; { signal } привязывает его задачу к сигналу React Query
    queryFn: ({ signal }) => bus.emit(getUser(id), { signal }),
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>{error.message}</p>;
  return <p>{data.name}</p>;
}
```

Action отклоняется, когда падают все попытки, так что React Query показывает `error`. React Query считает и свой `retry`: задайте `retry: false` в `useQuery`, когда обработчик уже повторяет, иначе попытки перемножаются.

## Вызовите его из SWR

<!-- docs-check: continue -->

SWR не передаёт сигнал в fetcher, так что отдавать в `emit` нечего. Action всё равно даёт `retry` и `timeout`.

```jsx
// Profile.jsx
import useSWR from "swr";
import { bus } from "./bus";
import { getUser } from "./user";

// fetcher получает ключ (здесь id) и возвращает промис
const fetcher = (id) => bus.emit(getUser(id));

export function Profile({ id }) {
  const { isLoading, data, error } = useSWR(id, fetcher);

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>{error.message}</p>;
  return <p>{data.name}</p>;
}
```

## Сообщите шине результат

<!-- docs-check: continue -->

Action с обработчиком возвращает результат только вызывающему. Если стор или другой модуль должен отреагировать на загруженного пользователя, обработчик может сообщить об этом:

```js
// user-events.js
import { createAction } from "nanoeffects/actions";

// createAction — событие с нагрузкой
export const userLoaded = createAction("user/loaded");
```

Отправьте его из обработчика через `ctx.emit(userLoaded(user))`. Не заменяйте здесь action на `createJob`: job сам обрабатывает ошибку и завершается значением `undefined`, поэтому React Query никогда не увидел бы сбоя. Берите job, когда никто не ждёт результат, а приложение показывает состояние загрузки по шине, см. [Покажите состояние загрузки через job](actions.md#покажите-состояние-загрузки-через-job).

## Вызовите его из RTK Query

<!-- docs-check: new -->

RTK Query передаёт `queryFn` эндпоинта `signal` вторым аргументом, так что вызов тот же, что и с React Query: передайте его в `emit`. Эта страница не настраивает стор; для этого см. [Сторы](stores.md).

```js
// bus.js
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// signalPlugin — позволяет emit принимать { signal }
export const bus = createBus().use(signalPlugin());
```

```js
// user.js
import { createAction } from "nanoeffects/actions";

// createAction с обработчиком — emit возвращает то, что вернул обработчик
export const getUser = createAction("user/get", (id, { signal }) =>
  api.getUser(id, { signal }),
);
```

```js
// api-slice.js
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { bus } from "./bus";
import { getUser } from "./user";

export const userApi = createApi({
  reducerPath: "userApi",
  baseQuery: fakeBaseQuery(), // RTK Query — каждый эндпоинт приносит свой queryFn
  endpoints: (build) => ({
    getUser: build.query({
      // emit — запускает action; { signal } привязывает его задачу к запросу RTK Query
      queryFn: async (id, { signal }) => {
        const user = await bus.emit(getUser(id), { signal });
        return { data: user };
      },
    }),
  }),
});
```

## Дайте клиенту его сигнал один раз

<!-- docs-check: new -->

Проблема: action передаёт `signal` в каждый вызов `api`, и один забытый `{ signal }` оставляет запрос работающим после того, как запроса уже нет. `fromSignal` строит клиента из сигнала каждой задачи, поэтому обработчик не может его забыть. Берите этот способ, когда многие actions делят одного клиента. Для одного action проще, как в [Создайте action](#создайте-action).

`fromSignal` помечает поле `contextPlugin`. Клиент создаётся, когда обработчик впервые читает `ctx.http`, из `ctx.signal` этой задачи. Подробнее в [Полях контекста](context.md#постройте-поле-из-сигнала-каждой-задачи).

```js
// bus.js
import axios from "axios";
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";
import { fromSignal, signalPlugin } from "nanoeffects/signal";

// fromSignal — http это новый клиент axios на каждую задачу, привязанный к сигналу этой задачи
const http = fromSignal((signal) => axios.create({ baseURL: "/api", signal }));

// contextPlugin — каждый обработчик получает ctx.http
const context = contextPlugin({ http });

// signalPlugin — emit принимает { signal }, так что сигнал запроса доходит до задачи
export const bus = createBus().use(signalPlugin()).use(context);
```

```js
// user.js
import { createAction } from "nanoeffects/actions";

// обработчик никогда не видит сигнал: ctx.http останавливается, когда задача прерывается
export const getUser = createAction("user/get", async (id, { http }) => {
  const response = await http.get(`/users/${id}`);
  return response.data;
});
```

```jsx
// Profile.jsx
import { useQuery } from "@tanstack/react-query";
import { bus } from "./bus";
import { getUser } from "./user";

export function Profile({ id }) {
  const { data } = useQuery({
    queryKey: ["user", id],
    // emit — сигнал React Query прерывает задачу, а с ней и запрос ctx.http
    queryFn: ({ signal }) => bus.emit(getUser(id), { signal }),
  });

  return <p>{data?.name}</p>;
}
```

## Направьте живой поток в кэш

<!-- docs-check: new -->

Проблема: цены приходят из сокета, и компонент должен показывать самую свежую без повторного запроса. Код сокета отправляет событие на шину; компонент читает эти события через `events` и записывает каждое в кэш. У обеих библиотек есть точка входа для приходящих данных: `setQueryData` в React Query и `useSWRSubscription` в SWR.

`events` передаёт нагрузки в цикл `for await`. `buffer: 1` хранит только новейшую цену, пока идёт запись. Прерывание в очистке завершает цикл и отписывает обработчик. Подробнее в [Чтение события циклом `for await`](observable.md#читайте-событие-циклом-for-await).

```js
// bus.js
import { createBus } from "nanoeffects";

// createBus — шина, общая для кода сокета и компонентов
export const bus = createBus();
```

```js
// prices.js
import { createAction } from "nanoeffects/actions";

// createAction — событие, которое код сокета отправляет на каждую новую цену
export const priceChanged = createAction("price/changed");
```

```jsx
// Price.jsx
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { events } from "nanoeffects/observable";
import { bus } from "./bus";
import { priceChanged } from "./prices";

export function Price({ symbol }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["price", symbol],
    queryFn: () => api.getPrice(symbol), // первое значение; поток поддерживает его свежим
  });

  useEffect(() => {
    const controller = new AbortController();
    // events — событие с новейшей ценой, по одному
    const prices = events(bus, priceChanged, {
      signal: controller.signal,
      buffer: 1,
    });

    async function follow() {
      for await (const price of prices) {
        if (price.symbol === symbol) {
          queryClient.setQueryData(["price", symbol], price.value); // записать в кэш
        }
      }
    }

    follow().catch((error) => {
      if (!controller.signal.aborted) throw error; // прерывание завершает цикл; всё остальное — ошибка
    });

    return () => controller.abort(); // компонент ушёл: цикл заканчивается, подписка снимается
  }, [queryClient, symbol]);

  return <p>{data}</p>;
}
```

SWR делает то же через `useSWRSubscription` из `swr/subscription`. Его функция подписки получает `next`, чтобы протолкнуть значение, и возвращает очистку:

```jsx
// Price.jsx
import useSWRSubscription from "swr/subscription";
import { events } from "nanoeffects/observable";
import { bus } from "./bus";
import { priceChanged } from "./prices";

export function Price({ symbol }) {
  const { data } = useSWRSubscription(["price", symbol], (_key, { next }) => {
    const controller = new AbortController();
    // events — событие с новейшей ценой, по одному
    const prices = events(bus, priceChanged, {
      signal: controller.signal,
      buffer: 1,
    });

    async function follow() {
      for await (const price of prices) {
        if (price.symbol === symbol) {
          next(null, price.value); // SWR — передать значение хуку
        }
      }
    }

    follow().catch((error) => {
      if (!controller.signal.aborted) next(error);
    });

    return () => controller.abort(); // SWR вызывает это, когда уходит последний компонент с этим ключом
  });

  return <p>{data}</p>;
}
```

## Перезапрашивайте запросы, когда шина так скажет

<!-- docs-check: new -->

Проблема: сохранение в одной части приложения должно обновить списки в другой. Сохранение отправляет событие, а компонент, которому принадлежат запросы, его слушает. Один `AbortController` завершает все подписки компонента вместо отдельного `unbind` на каждого. Для одной подписки короче `return bus.on(…)` из эффекта.

Для этого нужен `signalPlugin`, потому что `{ signal }` в параметрах `on` читает плагин. Без него подписки остаются после ухода компонента.

```js
// bus.js
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// signalPlugin — on принимает { signal } и снимает подписку, когда сигнал прерывается
export const bus = createBus().use(signalPlugin());
```

```js
// user-events.js
import { createAction } from "nanoeffects/actions";

// createAction — события, которые отправляет код сохранения
export const userSaved = createAction("user/saved");
export const userDeleted = createAction("user/deleted");
```

```jsx
// UserList.jsx
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { bus } from "./bus";
import { userDeleted, userSaved } from "./user-events";

export function UserList() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers() });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["users"] });

    // on с { signal } — обе подписки снимаются, когда компонент уходит
    bus.on(userSaved, refresh, { signal });
    bus.on(userDeleted, refresh, { signal });

    return () => controller.abort();
  }, [queryClient]);

  return <ul>{data?.map((user) => <li key={user.id}>{user.name}</li>)}</ul>;
}
```

## Учитывайте ограничения

- **Без плагина `{ signal }` игнорируется** — и в `emit`, и в параметрах `on`. Action выполняется, но прерывание до него не доходит. Вызовите `bus.use(signalPlugin())` один раз, там где создаётся шина.
- **Его принимают только формы вызова.** `bus.emit(getUser(id), { signal })` работает; `bus.emit("user/get", id, { signal })` — нет.
- **Обработчик, который возвращается без промиса, заканчивается вместе с вызовом**, так что сигнал, прерывающийся позже, до него не доходит. Actions, которые делают запросы, асинхронны, поэтому это важно только для синхронного обработчика, который настраивает callback.
- **Давайте каждому запросу свой сигнал для события.** Для action с обработчиком или задачи связь заканчивается, когда они завершаются. Для `bus.emit(action, { signal })` она остаётся, пока сигнал не прервётся.
- **Сигнал доходит до задач, которые запускает этот `emit`**, то есть до подписчиков этого action и дочерних задач `ctx.run`. Отдельный `bus.emit`, который делает обработчик, не связан: передайте ему `{ signal: ctx.signal }`.
