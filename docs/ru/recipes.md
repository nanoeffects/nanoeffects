# Типовые задачи

> **[Уровни A–E](README.md#виды-проектов)**: от небольшого приложения до готового приложения на Redux, Zustand, MobX или Pinia. Сначала прочитайте: [Руководство](guide.md#1-создание-шины-событий).

У каждой задачи сначала описана проблема, затем идёт короткое решение. Если на странице есть подробности, последняя строка ведёт к ним. Задачи идут от простых к сложным.

## На этой странице

- [События и обработчики](#события-и-обработчики)
  - [Обработчику нужен API-клиент, store или логгер](#обработчику-нужен-api-клиент-store-или-логгер)
  - [Один обработчик упал, остальные должны выполниться](#один-обработчик-упал-остальные-должны-выполниться)
  - [Опечатка в имени события](#опечатка-в-имени-события)
- [Гонки и повторные действия в UI](#гонки-и-повторные-действия-в-ui)
  - [Старый ответ затирает новый](#старый-ответ-затирает-новый)
  - [Поле поиска отправляет запрос на каждую клавишу](#поле-поиска-отправляет-запрос-на-каждую-клавишу)
  - [Второй клик отправляет второй запрос](#второй-клик-отправляет-второй-запрос)
  - [Сообщения должны уходить по порядку](#сообщения-должны-уходить-по-порядку)
  - [Кнопка «Удалить» в списке блокирует соседние строки](#кнопка-удалить-в-списке-блокирует-соседние-строки)
  - [Несколько компонентов запрашивают одни и те же данные](#несколько-компонентов-запрашивают-одни-и-те-же-данные)
  - [Форма сохраняет один и тот же текст дважды](#форма-сохраняет-один-и-тот-же-текст-дважды)
- [Ненадёжная сеть и длинные сценарии](#ненадёжная-сеть-и-длинные-сценарии)
  - [Запрос иногда падает: retry и backoff](#запрос-иногда-падает-retry-и-backoff)
  - [Запрос зависает: timeout](#запрос-зависает-timeout)
  - [Обновлять данные каждые N секунд: poll](#обновлять-данные-каждые-n-секунд-poll)
  - [Дождаться другого события внутри обработчика: take](#дождаться-другого-события-внутри-обработчика-take)
  - [Загрузить несколько ресурсов сразу: all](#загрузить-несколько-ресурсов-сразу-all)
  - [Взять самый быстрый ответ: race](#взять-самый-быстрый-ответ-race)
  - [Поток остановился на полпути: откатить сделанные шаги](#поток-остановился-на-полпути-откатить-сделанные-шаги)
  - [API разрешает только N запросов в секунду](#api-разрешает-только-n-запросов-в-секунду)
  - [Много мелких событий, один запрос](#много-мелких-событий-один-запрос)
- [Фичи и доменная логика](#фичи-и-доменная-логика)
  - [Получить результат от emit](#получить-результат-от-emit)
  - [Сгруппировать фичу с её обработчиками: модули](#сгруппировать-фичу-с-её-обработчиками-модули)
  - [Не оставлять подписки после закрытия виджета](#не-оставлять-подписки-после-закрытия-виджета)
- [Остановка работы на backend](#остановка-работы-на-backend)
- [Отладка: что выполнилось и почему](#отладка-что-выполнилось-и-почему)
- [Тест политики на поддельных таймерах](#тест-политики-на-поддельных-таймерах)
- [Другие библиотеки в проекте](#другие-библиотеки-в-проекте)
- [ООП и TypeScript](#ооп-и-typescript)
  - [Шина в классе](#шина-в-классе)
  - [Типы шины в нескольких файлах](#типы-шины-в-нескольких-файлах)
- [Примеры приложений](#примеры-приложений)

## События и обработчики

### Обработчику нужен API-клиент, store или логгер

Многим обработчикам нужен один и тот же `api`-клиент или логгер. Если импортировать его в каждом файле, обработчики привязываются к одному клиенту, а тестировать их труднее. Положите клиент на шину один раз: каждая задача получит его в `ctx`.

```js
import { createBus } from "nanoeffects";

// createBus({ context }) — каждая задача получает эти поля на ctx
const bus = createBus({ context: { api, logger } });

bus.on("save", async (draft, { api, logger }) => {
  await api.save(draft);
  logger.info("saved");
});
```

Подробнее: [Поля контекста](context.md).

### Один обработчик упал, остальные должны выполниться

На `order/placed` подписаны два обработчика: один отправляет аналитику, другой сохраняет заказ. По умолчанию первая ошибка прекращает перебор, и упавшая аналитика может помешать сохранить заказ. С `onError` выполняется каждый обработчик, а ошибки попадают в одно место.

```js
import { createBus } from "nanoeffects";

const bus = createBus({
  // onError — изолирует обработчики: выброшенная ошибка попадает сюда, а следующий обработчик всё равно выполняется
  onError: (error, { type }) => report(error, type),
});

const sendAnalytics = (order) => {
  throw new Error(`analytics is down for ${order.id}`);
};
const saveOrder = (order) => console.log("saved", order.id);

bus.on("order/placed", sendAnalytics); // выбрасывает ошибку
bus.on("order/placed", saveOrder); // всё равно выполняется

bus.emit("order/placed", { id: 1 }); // saved 1
```

Подробнее: [Ошибки и события без подписчиков](errors.md#изоляция-упавших-обработчиков).

### Опечатка в имени события

`emit("serch")` не падает: на это имя никто не подписан, поэтому ничего не происходит, а ошибку ищут в обработчике. `onUnhandled` предупреждает о событии, которого никто не услышал. Включите его при разработке.

```js
import { createBus } from "nanoeffects";

const bus = createBus({
  // onUnhandled — вызывается, когда у события нет подписок
  onUnhandled: ({ type }) => console.warn(`Nobody listens to "${type}"`),
});

bus.on("search", (query) => console.log(query));

bus.emit("serch", "nano"); // предупреждение: Nobody listens to "serch"
```

Подробнее: [События без подписчиков](errors.md#события-без-подписчиков).

## Гонки и повторные действия в UI

### Старый ответ затирает новый

Пользователь печатает `re`, затем `react`. Идут два запроса. Сервер быстро отвечает на `react` и медленно на `re`, поэтому ответ на `re` приходит последним и подменяет правильный список неправильным. Так ведёт себя обычный эффект React:

```jsx
import { useEffect, useState } from "react";

export function Search({ query }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    // два запроса идут одновременно, и побеждает тот, что завершился последним, даже если он старый
    api.search(query).then(setItems);
  }, [query]);

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.title}</li>
      ))}
    </ul>
  );
}
```

Вынесите запрос в обработчик с `latest`: новый `search` прерывает предыдущий запрос, а прерванный результата не выдаёт.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// latest — новый "search" прерывает предыдущий и отбрасывает его результат
bus.on(
  "search",
  latest(async (query, { signal }) => {
    // signal — позволяет браузеру отменить сам запрос
    const items = await api.search(query, { signal });
    bus.emit("results", items);
  }),
);

bus.on("results", (items) => render(items));
```

Подробнее: [Отмена устаревших запросов](cancel-stale-requests.md), [Политики](policies.md#latest-прерывание-предыдущего-запуска) и сторона компонента в [Форме регистрации на React](react.md).

### Поле поиска отправляет запрос на каждую клавишу

Набор слова `react` отправляет пять запросов, а список мигает. `debounce` ждёт паузы в наборе, `latest` прерывает запрос, который ещё идёт.

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus();

// latest — новый поиск прерывает запрос в полёте
const searchLatest = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  bus.emit("results", items);
});

// debounce — запуск через 300 мс без нового "typed"
bus.on("typed", debounce(300, searchLatest));
```

Подробнее: [Пауза между запросами](debounce-and-abort.md).

### Второй клик отправляет второй запрос

Пользователь дважды кликает «Зарегистрироваться» на медленной сети, и создаются два аккаунта. `leading` отбрасывает все вызовы, пришедшие, пока идёт первый.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus();

// leading — вызов, пришедший во время предыдущего, отбрасывается
bus.on(
  "form/submitted",
  leading(async (form, { signal }) => {
    await api.signUp(form, { signal });
  }),
);
```

Подробнее: [Защита от повторной отправки](prevent-double-submit.md).

### Сообщения должны уходить по порядку

В чате пользователь отправляет `Привет` и через секунду `Как дела?`. Два параллельных запроса могут дойти до сервера в обратном порядке. `queue` отправляет следующее сообщение только после доставки предыдущего.

```js
import { createBus } from "nanoeffects";
import { queue } from "nanoeffects/policies";

const bus = createBus();

// queue — следующее сообщение ждёт, пока доставится предыдущее
bus.on(
  "message/sent",
  queue(async (message, { signal }) => {
    await api.sendMessage(message, { signal });
  }),
);
```

Подробнее: [Политики, очередь через `queue`](policies.md#очередь-событий-через-queue).

### Кнопка «Удалить» в списке блокирует соседние строки

Вы защитили «Удалить» через `leading`. Пока удаляется одна строка, клики по остальным тоже отбрасываются: у всего обработчика одно state. `key` даёт каждой строке своё.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus();

// leading с key — у каждого id строки своё state, поэтому другие строки не блокируются
bus.on(
  "row/deleted",
  leading(
    async (row, { signal }) => {
      await api.deleteRow(row.id, { signal });
    },
    { key: (row) => row.id },
  ),
);
```

Подробнее: [Политики, `key`](policies.md#key-разделение-state-по-ключу).

### Несколько компонентов запрашивают одни и те же данные

Страница показывает пользователя в шапке, в сайдбаре и в комментарии, и все три запрашивают пользователя `1` в одном такте. Это три одинаковых запроса. `dedupe` заставляет вызовы с одним id делить один запрос. Используйте его для чтения, а не для записи.

```js
import { createBus } from "nanoeffects";
import { dedupe } from "nanoeffects/policies";

const bus = createBus();

// dedupe — вызов для id, который уже загружается, ждёт этот запрос
bus.on(
  "user/needed",
  dedupe(async (id, ctx) => {
    const user = await api.getUser(id, { signal: ctx.signal });
    ctx.emit("user/loaded", user);
  }),
);
```

Подробнее: [Политики, `dedupe`](policies.md#dedupe-общий-запуск-для-одинаковых-вызовов).

### Форма сохраняет один и тот же текст дважды

Форма сохраняется при каждом изменении. Пользователь набрал букву и стёр её, и тот же текст снова уходит на сервер. `distinct` пропускает вызов, чей payload равен последнему.

```js
import { createBus } from "nanoeffects";
import { distinct } from "nanoeffects/policies";

const bus = createBus();

// distinct — текст, равный последнему сохранённому, пропускается
bus.on(
  "draft/changed",
  distinct(async (text, { signal }) => {
    await api.saveDraft(text, { signal });
  }),
);
```

Подробнее: [Политики, `distinct`](policies.md#distinct-пропуск-повторного-payload).

## Ненадёжная сеть и длинные сценарии

### Запрос иногда падает: retry и backoff

Запрос иногда падает из-за сети. `retry` повторяет его. Если backend перегружен, мгновенные повторы только ухудшают дело, поэтому `backoff` увеличивает паузу с каждой попыткой.

```js
import { createBus } from "nanoeffects";
import { backoff, retry } from "nanoeffects/effects";

const bus = createBus();

// retry — повторять запрос после ошибки, до 4 попыток
const loadWithRetry = retry((id, { signal }) => api.getUser(id, { signal }), {
  times: 4,
  // backoff — пауза растёт (200, 400, 800 мс) со случайной добавкой, чтобы клиенты не повторяли запрос в один момент
  delay: backoff({
    base: 200,
    max: 5000,
    jitter: true,
  }),
});

bus.on("user/opened", loadWithRetry);
```

Подробнее: [`backoff`](effects.md#backoff).

### Запрос зависает: timeout

Запрос не падает и не отвечает, а спиннер крутится бесконечно. `timeout` отклоняет вызов через заданное время и прерывает запрос.

```js
import { createBus } from "nanoeffects";
import { timeout } from "nanoeffects/effects";

const bus = createBus();

// timeout — отклонить с TimeoutError и прервать запрос через 5 с
const loadOnce = timeout(5000, (id, { signal }) => api.getUser(id, { signal }));

bus.on("user/opened", loadOnce);
```

Подробнее: [`timeout`](effects.md#timeout).

### Обновлять данные каждые N секунд: poll

Дашборд должен обновлять цифры каждые десять секунд, пока открыт. `poll` — эффект: он вызывает вашу функцию по таймеру и заканчивается, когда задача прервана, поэтому закрытый дашборд не продолжает опрашивать.

```js
import { createBus } from "nanoeffects";
import { poll } from "nanoeffects/effects";

const bus = createBus();

bus.on("dashboard/opened", async (_, ctx) => {
  // остановить опрос, когда пользователь уходит
  ctx.on("dashboard/closed", () => ctx.abort());

  // poll — вызывать refresh каждые 10 с, пока задача не прервана
  await poll(ctx, () => refresh(), 10_000);
});
```

Подробнее: [`poll`](effects.md#poll).

### Дождаться другого события внутри обработчика: take

После входа обработчик должен дождаться выхода пользователя и только потом очистить данные. Вместо флага и второго обработчика `take` приостанавливает обработчик до следующего события с таким именем.

```js
import { createBus } from "nanoeffects";
import { take } from "nanoeffects/effects";

const bus = createBus();

bus.on("login", async (user, ctx) => {
  // take — приостановить обработчик до следующего "logout"
  const reason = await take(ctx, "logout");
  cleanup(user, reason);
});
```

Подробнее: [`take`](effects.md#take).

### Загрузить несколько ресурсов сразу: all

Странице профиля нужны пользователь и его посты. Загружать их по очереди медленно. `all` запускает оба запроса вместе и прерывает второй, если первый упал.

```js
import { createBus } from "nanoeffects";
import { all } from "nanoeffects/effects";

const bus = createBus();

bus.on("profile/opened", async (id, ctx) => {
  // all — запустить оба запроса вместе; если один упал, второй прерывается. child несёт сигнал своего запроса
  const { user, posts } = await all(ctx, {
    user: (child) => fetchUser(id, child),
    posts: (child) => fetchPosts(id, child),
  });

  ctx.emit("profile/loaded", { user, posts });
});
```

### Взять самый быстрый ответ: race

Одни и те же данные есть на двух серверах, и нужен ответ того, что быстрее. `race` возвращает первый ответ и прерывает второй запрос.

```js
import { createBus } from "nanoeffects";
import { race } from "nanoeffects/effects";

const bus = createBus();

bus.on("user/opened", async (id, ctx) => {
  // race — побеждает первый ответ, более медленный запрос прерывается
  const result = await race(ctx, {
    primary: (child) => api.getUser(id, child),
    backup: (child) => api.getUserFromBackup(id, child),
  });

  const user = "primary" in result ? result.primary : result.backup;
  ctx.emit("user/loaded", user);
});
```

Подробнее: [`all`](effects.md#all), [`race`](effects.md#race).

### Поток остановился на полпути: откатить сделанные шаги

Оформление заказа создаёт заказ, а затем списывает деньги с карты. Если списание упало, заказ остаётся в системе без оплаты. То же происходит, если пользователь ушёл со страницы между двумя вызовами. `transaction` выполняет шаги по порядку и, когда один упал или задачу прервали, вызывает `rollback` у завершённых шагов, последний первым.

```js
import { createBus } from "nanoeffects";
import { retry, transaction } from "nanoeffects/effects";

const bus = createBus();

// retry с {} — откат тоже может упасть, поэтому пробуем вернуть деньги до 3 раз; {} значит «без signal», прерывание не остановит
const refundWithRetry = (paymentId) =>
  retry({}, () => api.refund(paymentId), { times: 3 });

bus.on("checkout", async (order, ctx) => {
  // transaction — выполнить шаги по порядку; если один упал, откатить завершённые, последний первым
  const [orderId, paymentId] = await transaction(
    ctx,
    {
      run: ({ signal }) => api.createOrder(order, { signal }),
      // rollback получает то, что вернул run, и не получает signal прерывания
      rollback: (orderId) => api.cancelOrder(orderId),
    },
    {
      run: ({ signal }) => api.charge(order, { signal }),
      rollback: refundWithRetry,
    },
  );

  ctx.emit("checkoutDone", { orderId, paymentId });
});
```

Список завершённых шагов живёт в памяти: закрытая вкладка теряет откат, который не успел выполниться. Сделайте каждый `rollback` безопасным для повторного вызова.

Подробнее: [`transaction`](effects.md#transaction), параметры стратегии `rollbackOn`, `rollbackFailure` и `rollbackOrder`.

### Шагу нужно то, что вернул предыдущий

Для списания нужен id заказа, который создал первый шаг. Список шагов — это данные, и шаг в нём не может прочитать, что вернул предыдущий. Запишите транзакцию функцией: `step` отдаёт значение своего `run`, следующий шаг читает его из переменной, а `rollback` получает тип этого значения.

```js
import { createBus } from "nanoeffects";
import { transaction } from "nanoeffects/effects";

const bus = createBus();

bus.on("checkout", async (order, ctx) => {
  // transaction — функция; если шаг упал, завершённые шаги откатываются, последний первым
  const paymentId = await transaction(ctx, async (step) => {
    // step — выполнить работу как шаг; отдаёт значение, которое вернул run
    const placed = await step(
      ({ signal }) => api.createOrder(order, { signal }),
      // rollback получает это значение и не получает signal прерывания
      (placed) => api.cancelOrder(placed.id),
    );

    // placed — обычная переменная, поэтому следующий шаг читает placed.id
    const payment = await step(
      ({ signal }) => api.charge(placed.id, { signal }),
      (payment) => api.refund(payment.id),
    );

    return payment.id;
  });

  ctx.emit("checkoutDone", paymentId);
});
```

Результат `transaction` — то, что вернула функция. Упавший шаг не откатывается: шаг атомарен или убирает за собой сам внутри своего `run`.

Подробнее: [`transaction`](effects.md#transaction).

### API разрешает только N запросов в секунду

API геокодирования разрешает 5 запросов в секунду. Список из 40 адресов отправляет 40 запросов сразу, и большинство падает с `429`. `rateLimit` запускает пять и держит остальные, пока окно не сдвинется.

```js
import { createBus } from "nanoeffects";
import { rateLimit } from "nanoeffects/policies";

const bus = createBus();

// rateLimit — за секунду могут начаться пять запросов, остальные ждут своей очереди
bus.on(
  "address/geocode",
  rateLimit(5, 1000, async (address, ctx) => {
    const place = await api.geocode(address, { signal: ctx.signal });
    ctx.emit("address/found", place);
  }),
);
```

Подробнее: [Политики, `rateLimit`](policies.md#ratelimit-соблюдение-квоты).

### Много мелких событий, один запрос

Страница отправляет событие аналитики на каждый клик, 30 запросов в минуту. Серверу удобнее один запрос со всеми. `batch` собирает события, пришедшие за окно, и отправляет их вместе.

```js
import { createBus } from "nanoeffects";
import { batch } from "nanoeffects/policies";

const bus = createBus();

// batch — всё, что пришло за 500 мс, уходит одним запросом
bus.on(
  "analytics/event",
  batch(500, async (events, { signal }) => {
    await api.sendEvents(events, { signal });
  }),
);
```

Подробнее: [Политики, `batch`](policies.md#batch-отправка-нескольких-вызовов-одним).

## Фичи и доменная логика

### Получить результат от emit

`emit` обычного события ничего не возвращает, и для ответа нужно второе событие. Action с обработчиком возвращает результат своего обработчика прямо из `emit`.

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";

const bus = createBus();

// createAction с обработчиком — emit запускает его и возвращает результат
const double = createAction("math/double", (value) => value * 2);

const result = bus.emit(double(21)); // 42
```

Подробнее: [Actions, jobs и модули](actions.md).

### Сгруппировать фичу с её обработчиками: модули

У фичи несколько подписок, и каждую нужно не забыть снять. Модуль регистрирует их вместе и снимает все одним `unmount`.

```js
import { createBus } from "nanoeffects";
import { createModule, modulePlugin } from "nanoeffects/actions";

// createModule — одна фича; unmount отменяет всё, что она зарегистрировала
const greeting = createModule("greeting", (m) => {
  m.on("greet", (name) => console.log(`hello ${name}`));
});

const bus = createBus();
const app = bus.use(modulePlugin([greeting]));

app.unmount(greeting); // подписки нет
```

Подробнее: [Модули](actions.md#модули) и [Руководство](guide.md#9-создание-модулей).

### Не оставлять подписки после закрытия виджета

Виджет чата подписывается на шину при открытии. Если закрыть его без отписки, обработчики остаются: память растёт с каждым открытием, а они продолжают обновлять уже не существующий виджет. Модуль, который подключается при открытии и отключается при закрытии, ничего не оставляет.

```js
import { createBus } from "nanoeffects";
import { createModule, modulePlugin } from "nanoeffects/actions";

// модуль владеет подписками виджета
const chatModule = createModule("chat", (m) => {
  m.on("message/received", (message) => render(message));
});

const bus = createBus();
const app = bus.use(modulePlugin());

const stop = app.mount(chatModule); // виджет открыт: подписки на шине

stop(); // виджет закрыт: подписок не осталось
console.log(bus.get("message/received").length); // 0
```

Подробнее: [Виджет чата](chat-widget.md).

## Остановка работы на backend

Клиент закрыл вкладку, а backend продолжает опрашивать для него другие сервисы. Создайте `AbortController` на запрос, прервите его при закрытии соединения и передайте сигнал в `emit`: `timeout`, `retry` и сам запрос остановятся.

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { signalPlugin } from "nanoeffects/signal";

// signalPlugin — emit принимает { signal }
const bus = createBus().use(signalPlugin());

const getUser = createAction("user/get", (id, { signal }) => api.getUser(id, { signal }));

export async function handleRequest(request, reply) {
  const controller = new AbortController();

  // close — клиент ушёл: прервать всё, что запущено для этого запроса
  reply.raw.on("close", () => controller.abort());

  // задача и её запросы останавливаются вместе с контроллером
  return bus.emit(getUser(request.params.id), { signal: controller.signal });
}
```

Подробнее: [Остановка работы на backend](server.md), в том числе для WebSocket и воркеров очереди.

## Отладка: что выполнилось и почему

Эффект сработал, а какое событие его вызвало, непонятно. Трассировщик пишет каждую задачу вместе с родителем, и вы видите цепочку событий.

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer — отправлять каждую задачу в консоль
const trace = createTracer(consoleLogger());

// tracePlugin — сообщать ещё и о каждом emit
const bus = createBus({ trace }).use(tracePlugin());

bus.on("search", (query, ctx) => ctx.emit("results", [query]));
bus.emit("search", "nano"); // в логе: search · emit, затем results · emit с search в качестве причины
```

Подробнее: [Трассировка задач](tracing.md). Чтобы перезагружать модули без обновления страницы, см. [Hot reload](hmr.md).

## Тест политики на поддельных таймерах

Тест `latest` или `debounce` полон чисел `advanceTimersByTime`, и по ним никто не поймёт, что тест доказывает. Запишите отправки и фазы диаграммами.

```js
import { it, vi } from "vitest";
import { latest } from "nanoeffects/policies";
import { createMarbleBus, fakeTimersClock } from "nanoeffects/testing";

// поиск, который занимает 50 мс
function search(query) {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

it("latest cancels the search that is running", async () => {
  vi.useFakeTimers();

  // createMarbleBus: шина, которая записывает трассировку; кадр — 10 мс
  const marbles = createMarbleBus({ clock: fakeTimersClock(vi) });
  marbles.bus.on("search/changed", latest(search), { traceId: "search" });

  // "a-b": две отправки, в кадре 0 и в кадре 2
  const result = await marbles.run({
    emits: { "search/changed": { marble: "a-b" } },
    frames: 12,
  });

  // s старт, c отмена, d готово
  result.expect({ "search/changed:latest": "s-(cs)----d----" });
});
```

Подробнее: [Тесты времени диаграммами](testing.md).

## Другие библиотеки в проекте

- **Redux Toolkit, Zustand, MobX или Pinia.** [Подключение store](stores.md).
- **React Query, SWR или RTK Query.** [Библиотеки запросов](query-libraries.md).
- **RxJS.** [nanoeffects рядом с RxJS](migrating-from-rxjs.md) и [Observable](observable.md).
- **Переход с redux-saga.** [Переход с redux-saga](migrating-from-saga.md).
- **Переход с Effector.** [Переход с Effector](migrating-from-effector.md).
- **Переход с mitt или nanoevents.** [Переход с mitt](migrating-from-mitt.md).

## ООП и TypeScript

### Шина в классе

Ваша логика живёт в классах, и каждый экземпляр должен снимать свои подписки, когда больше не нужен. `Emitter` даёт каждому экземпляру свою шину и `dispose`, который снимает все его подписки.

```js
import { Emitter } from "nanoeffects/oop";

// Emitter — у каждого экземпляра своя шина с on, once, off, emit и dispose
class VideoService extends Emitter {
  constructor() {
    super();
    this.on("played", () => console.log("playing"));
  }
}

const video = new VideoService();
video.emit("played");

video.dispose(); // снимает все подписки этого экземпляра
```

Подробнее: [Шина в классе](oop.md).

### Типы шины в нескольких файлах

Обработчики и модули лежат в разных файлах, и TypeScript должен знать payload и поля `ctx`. См. [TypeScript в нескольких файлах](typescript.md).

## Примеры приложений

- **Форма с проверкой имени и отправкой, на React.** [Форма регистрации на React](react.md).
- **Всё приложение по слоям: сущности, фичи, модули, backend.** [Чат с сущностями, фичами и модулями](chat-example.md).
- **Виджет, который слушает только пока открыт.** [Виджет чата](chat-widget.md).
- **Vue.** [nanoeffects в приложении на Vue](vue.md).
- **Svelte.** [nanoeffects в приложении на Svelte](svelte.md).
- **Готовый проект.** [Проект из шаблона](starter.md).
