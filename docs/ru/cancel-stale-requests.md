# Отмена устаревших запросов и гонки

> **Уровень B.** Сначала прочитайте: шину из [README](../../README.md).

Читайте эту страницу, если старый ответ может затереть новый: поле поиска показывает результаты предыдущего запроса, фильтр мигает, форма отправляется дважды. Здесь показаны причина, исправление через `latest` и то, как добавить паузу, повтор и таймаут. Нужна только шина из [README](../../README.md).

## Посмотрите на проблему

Пользователь печатает `ab`, затем `abc`. Стартуют два запроса. Если запрос для `ab` медленнее, он завершается последним, и его результаты заменяют правильные.

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // шина: события и обработчики

// Без политики каждый "search" запускает свой запрос, и побеждает самый медленный.
bus.on("search", async (query) => {
  const items = await api.search(query);
  bus.emit("results", items);
});
```

Проверка счётчика вручную (`if (id !== lastId) return`) скрывает старый результат, но старый запрос всё равно выполняется. Вызывать `controller.abort()` вручную можно, но контроллер нужно где-то хранить и прерывать перед каждым новым вызовом.

## Оставьте только последний запрос

Оберните обработчик в `latest`. Новый `"search"` прерывает задачу предыдущего, а прерванная задача результата не выдаёт.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

// latest: новый "search" прерывает старый запуск
bus.on(
  "search",
  latest(async (query, { signal }) => {
    // signal: передайте его дальше, чтобы браузер отменил запрос, а не только отбросил результат
    const items = await api.search(query, { signal });
    bus.emit("results", items);
  }),
);

bus.on("results", (items) => render(items));
```

Что заменить: `api.search` — ваша собственная функция запроса. Она должна принимать `{ signal }` и отдавать его в `fetch`. Без этого `latest` по-прежнему игнорирует старый результат, но запрос продолжает выполняться.

Результат: `emit("search", "ab")`, а затем `emit("search", "abc")` покажет только результаты для `abc`, а запрос для `ab` будет отменён.

## Дождитесь паузы в наборе

Добавьте `debounce` снаружи `latest`. Поиск стартует через 300 мс без новых нажатий.

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

// latest: новый поиск прерывает запрос в полёте
const searchLatest = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  render(items);
});

// debounce: запуск после 300 мс без нового "typed"
bus.on("typed", debounce(300, searchLatest));
```

## Повторите упавший запрос и ограничьте его время

Используйте `retry` и `timeout` вокруг запроса. Пауза растёт с каждой попыткой.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { backoff, retry, timeout } from "nanoeffects/effects";

const bus = createBus(); // шина: события и обработчики

// timeout: прервать одну попытку через 5 с
const searchOnce = timeout(5000, (query, { signal }) => api.search(query, { signal }));

// retry: до 4 попыток, backoff с каждым разом удлиняет паузу
const searchWithRetry = retry(searchOnce, {
  times: 4,
  delay: backoff({
    base: 200,
    max: 5000,
    jitter: true,
  }),
});

// latest: новый поиск прерывает всю цепочку повторов
bus.on(
  "search",
  latest(async (query, ctx) => {
    const items = await ctx.run(searchWithRetry, query); // ctx.run: дочерняя задача, прерывается вместе с этой
    ctx.emit("results", items);
  }),
);
```

## Выберите другую политику для другой гонки

| Ситуация | Политика |
| -------- | -------- |
| Важен только новейший результат (поиск, фильтр, переключение вкладки) | `latest` |
| Второй клик, пока идёт первый вызов, нужно игнорировать (отправка, оплата) | `leading` |
| Каждый вызов должен выполниться, один за другим (сохранение, загрузка) | `queue` |
| Вызовы приходят пачками, а нужен один в конце | `debounce` |
| Вызовы приходят пачками, а нужен один за период | `throttle` |
| У каждого пользователя или элемента своя гонка | добавьте `{ key }`, например `latest(handler, { key })` |

Все политики и их параметры: [Политики](policies.md). То же самое по шагам в форме: [Форма регистрации на React](react.md).
