# Переход с redux-saga

> **Уровень E, для тех, кто знает redux-saga.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Читайте эту страницу, если вы знаете redux-saga и хотите найти ту же задачу в nanoeffects. Здесь сопоставлены имена, показана одна переписанная сага и перечислено то, у чего аналога нет. Библиотеку она не объясняет: начните с [Руководства](guide.md).

## Найдите соответствие

| redux-saga | nanoeffects |
| ---------- | ----------- |
| `takeEvery` | `bus.on(event, handler)` |
| `takeLatest` | [`latest`](policies.md) |
| `takeLeading` | [`leading`](policies.md) |
| `debounce`, `throttle` | [`debounce`, `throttle`](policies.md) (те же правила, что у lodash) |
| `call(fn, x)` | `await ctx.run(task, x)` |
| `fork(fn, x)` | `ctx.run(task, x)` без `await` |
| `spawn(fn, x)` | `ctx.emit(event, x)` или `bus.emit(event, x)` |
| `put(action)` | `ctx.emit(action)` |
| `take(pattern)` | [`take(ctx, event, { predicate })`](effects.md), где `event` — имя или создатель действия |
| `select` | [поле контекста](context.md), например `store` |
| `all`, `race` | [`all`, `race`](effects.md) |
| `retry`, `delay` | [`retry`, `delay`](effects.md) |
| `cancel(task)` | `ctx.abort()` на контексте или более новый вызов под `latest` |
| `eventChannel` | `bus.emitter(action)` как колбэк подписки |
| `actionChannel` | [`queue`](policies.md) и другие политики |

## Перепишите сагу

Сага, которая ищет на каждый новый запрос, отменяет старый запрос и повторяет упавший:

<!-- docs-check: skip - код redux-saga, не nanoeffects -->
```js
// redux-saga
function* search({ payload }) {
  const items = yield retry(3, 1000, api.search, payload);
  yield put(found(items));
}
function* watchSearch() {
  yield takeLatest("search", search);
}
```

Та же задача в nanoeffects:

```js
import { createBus } from "nanoeffects";
import { retry } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

const search = (query, { signal }) => api.search(query, { signal });

bus.on(
  "search",
  latest(async (query, ctx) => {
    // latest: новый "search" прерывает этот запуск; ctx.signal прерван
    const load = retry(search, { times: 3, delay: 1000 }); // retry: до 3 попыток с паузой 1 с
    const items = await ctx.run(load, query); // дочерняя задача, прерывается вместе с этим обработчиком
    ctx.emit("found", items); // как put
  }),
);
```

Задачи — обычные `async`-функции. `ctx.signal` заменяет `cancel`: передайте его в `fetch` или в ваш клиент, и запрос остановится.

Чтобы увидеть работающие счётчик, `takeLatest` с `delay`, отмену и падающий вызов, откройте [пример counter](../../examples/counter): в нём есть страница без стора и страница с Redux Toolkit.

## Запустите задачу, не дожидаясь её

`fork` и `spawn` различаются тем, что происходит, когда вызывающий прерывается. Выбирайте по этому признаку.

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // шина: события и обработчики

const loadSidebar = (_, { signal }) => api.sidebar({ signal });

bus.on("page-opened", async (_, ctx) => {
  // как fork: дочерняя задача этой, прерывается вместе с ней
  const warmUp = ctx.run(loadSidebar);
  warmUp.catch(console.error); // никто её не ждёт, так что обработайте ошибку здесь

  // как spawn: новая задача, не останавливается, когда эта прервана
  ctx.emit("analytics", { page: "home" });
});
```

## Чем это отличается

- **Ошибки поднимаются только через `await`.** `await ctx.run(task)` и `all(ctx, …)` выбрасывают ошибку дочерней задачи вызывающему. Дочерняя задача, которую никто не ждёт, не прерывает родителя, как это делает дочерняя fork-задача в redux-saga: обработайте ошибку сами, как выше. См. [Ошибки](errors.md).
- **Прерывание идёт вниз.** Прерывание задачи прерывает её дочерние задачи. Дочерняя задача не прерывает соседей.
- **Эффекты — не данные.** `yield call(fn)` возвращает описание, которое тест может сравнить. Здесь `await` вызывает функцию. Тестируйте реальным обработчиком и поддельными таймерами, как это делают тесты этой библиотеки.
- **Нет генераторов.** Последовательные сценарии — это `async`-функции с `await take(ctx, event)`.
- **Нет `END` канала.** Задача останавливается, когда прерывается её сигнал.
- **Одна нагрузка.** У задачи один аргумент, поэтому передавайте объект там, где сага передаёт несколько.
