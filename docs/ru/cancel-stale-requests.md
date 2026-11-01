# Отмена устаревших запросов и гонки

> **Уровень B.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1 и 2.

Старый ответ затирает новый: поле поиска показывает результаты предыдущего запроса, фильтр мигает, форма отправляется дважды. Причина, исправление через `latest`, пауза, повтор и таймаут. Нужна только шина: [Руководство](guide.md#1-создайте-шину), шаг 1.

## Проблема

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

Ручная проверка счётчика (`if (id !== lastId) return`) скрывает старый результат, но старый запрос всё равно выполняется. `controller.abort()` можно вызывать вручную, но контроллер придётся где-то хранить и прерывать перед каждым новым вызовом.

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

Что заменить: `api.search` — ваша функция запроса. Она должна принимать `{ signal }` и передавать его в `fetch`. Без этого `latest` по-прежнему игнорирует старый результат, но запрос продолжает выполняться.

Результат: после `emit("search", "ab")` и `emit("search", "abc")` вы увидите только результаты для `abc`, а запрос для `ab` отменится.

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

Оберните запрос в `retry` и `timeout`. Пауза растёт с каждой попыткой.

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

Другие политики: [Политики](policies.md).
