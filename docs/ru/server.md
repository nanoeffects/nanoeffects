# Остановка работы на сервере, когда клиент ушёл

> **Уровень C.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Читайте эту страницу, если вы запускаете сервер на Node (в примерах [Fastify](https://fastify.dev)) и хотите, чтобы работа для запроса, сокета или задачи из очереди прекращалась, когда она никому не нужна. Здесь показан один приём в трёх местах: запрос, WebSocket и воркер.

Нужны Node 18 или новее, `fastify` и `nanoeffects`. `api` ниже — ваш собственный клиент для другого сервиса: замените его своими запросами.

## Зачем это серверу

Закрытая вкладка браузера останавливает свои запросы. Сервер так не умеет: если клиент ушёл, запросы, которые сервер сделал для него, продолжаются, как и их повторы. На загруженном сервере это лишняя работа и более медленный сервис для всех остальных.

Решение — один `AbortController` на каждую единицу работы, которой владеет клиент, и одно правило: **когда клиент уходит, прервите контроллер.** `signalPlugin` позволяет `bus.emit` принять этот сигнал, поэтому `timeout`, `retry` и сам запрос останавливаются.

| Единица работы | Создаётся, когда | Прерывается, когда |
| -------------- | ---------------- | ------------------ |
| HTTP-запрос | стартует маршрут | соединение закрылось до ответа |
| WebSocket | сокет подключился | сокет закрылся |
| Задача из очереди | задача принята | сервер выключается |

## Создайте шину и действие

Шина и действие лежат в файлах, которые ничего не знают о HTTP, так что то же действие может выполняться в маршруте, тесте или воркере.

```js
// bus.js
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// createBus — шина, общая для сервера
// signalPlugin — позволяет emit принимать { signal }, чтобы закрытое соединение могло прервать работу
export const bus = createBus().use(signalPlugin());
```

Действие загружает пользователя. Оно пробует запрос до трёх раз и сдаётся на каждой попытке через пять секунд. `ctx.signal` — сигнал задачи: он прерывается, когда прерывается контроллер запроса.

```js
// user.js
import { createAction } from "nanoeffects/actions";
import { retry, timeout } from "nanoeffects/effects";

// createAction — действие с обработчиком: emit возвращает то, что вернул обработчик
export const getUser = createAction("user/get", async (id, ctx) => {
  // одна попытка: запрос с сигналом timeout, чтобы тот мог его остановить
  const load = ({ signal }) => api.getUser(id, { signal });
  // timeout — провалить попытку через 5 с
  const attempt = () => timeout(ctx, 5000, load);
  // retry — до 3 попыток с паузой 500 мс
  return retry(ctx, attempt, { times: 3, delay: 500 });
});
```

## Остановите работу запроса

<!-- docs-check: continue -->

Создайте контроллер, когда стартует маршрут. Слушайте `close` у **ответа** (`reply.raw`): он наступает, когда соединение заканчивается. `request.raw` тоже отправляет `close`, но делает это, когда тело запроса прочитано, а не когда клиент ушёл, так что здесь это не то событие.

```js
// server.js
import Fastify from "fastify";
import { bus } from "./bus";
import { getUser } from "./user";

export const app = Fastify();

// контроллеры запросов, на которые ещё отвечают, для остановки сервера ниже
export const inFlight = new Set();

app.get("/users/:id", async (request, reply) => {
  const controller = new AbortController();
  inFlight.add(controller);

  // close у ответа — соединение закончилось; если ответ не был завершён, клиент ушёл
  reply.raw.on("close", () => {
    inFlight.delete(controller);
    if (!reply.raw.writableFinished) {
      controller.abort();
    }
  });

  try {
    // emit с { signal } — прерывание контроллера прерывает действие: timeout, retry и сам запрос
    const call = getUser(request.params.id);
    return await bus.emit(call, { signal: controller.signal });
  } catch (error) {
    // отвечать некому, когда клиент закрыл соединение
    if (reply.raw.destroyed) {
      return reply;
    }
    return reply.code(502).send({ error: String(error) });
  }
});
```

После прерывания действие отклоняется с причиной прерывания. Блок `catch` выше игнорирует её, когда соединения уже нет, потому что отвечать некому.

## Остановите сервер

<!-- docs-check: continue -->

Храните контроллеры запросов в полёте в множестве. По SIGTERM (его посылает контейнер) или SIGINT (Ctrl+C) прервите их все, затем закройте приложение. Запрос, прерванный таким образом, отвечает ошибкой, а `app.close()` ждёт окончания соединений.

```js
// shutdown.js
import { app, inFlight } from "./server";

// SIGTERM посылает контейнер, SIGINT — это Ctrl+C
for (const name of ["SIGTERM", "SIGINT"]) {
  process.on(name, async () => {
    for (const controller of inFlight) {
      controller.abort();
    }
    await app.close();
    process.exit(0);
  });
}
```

Маршрут выше наполняет `inFlight` и очищает его в слушателе `close`. [Пример api-server](../../examples/api-server) делает то же самое, с лимитом в две секунды на закрытие.

## Привяжите WebSocket к его работе

<!-- docs-check: continue -->

Сокет живёт минуты и несёт несколько задач (подписка, heartbeat), поэтому контроллер принадлежит сокету, а каждый `emit` для него получает тот же сигнал. Закрытие сокета останавливает их все.

Сначала действие. Оно отправляет цену сразу, а затем каждую секунду, пока его задача не будет прервана.

```js
// prices.js
import { createAction } from "nanoeffects/actions";
import { poll } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

// createAction — действие с обработчиком
// latest — новая подписка останавливает старую; key — но только старую того же сокета
export const watchPrices = createAction(
  "prices/watch",
  latest(
    async (call, ctx) => {
      // poll — вызывать функцию сразу и каждую секунду, пока задача не будет прервана
      await poll(ctx, () => call.send(`${call.symbol}: ${Math.random()}`), 1000, {
        leading: true,
      });
    },
    { key: (call) => call.socketId },
  ),
);
```

Без `key` одна политика обслуживает всё действие, и новая подписка на одном сокете остановила бы подписку на другом.

Затем маршрут. Каждый сокет получает идентификатор и контроллер.

```js
// sockets.js
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { bus } from "./bus";
import { watchPrices } from "./prices";

const sockets = Fastify();
sockets.register(websocket);

let lastSocketId = 0;

sockets.register(async (instance) => {
  instance.get("/prices", { websocket: true }, (socket) => {
    lastSocketId += 1;
    const socketId = lastSocketId;
    const controller = new AbortController();
    const { signal } = controller;

    // close — клиент ушёл: остановить всё, что запущено для этого сокета
    socket.on("close", () => controller.abort());

    socket.on("message", (data) => {
      const send = (text) => socket.send(text);
      const call = watchPrices({ socketId, symbol: String(data), send });
      // emit с { signal } — вызов останавливается, когда сокет закрывается
      bus.emit(call, { signal });
    });
  });
});
```

[Пример ws-server](../../examples/ws-server) добавляет закрытие молчащего сокета, собранное из `race`, `take` и `delay`.

## Запустите воркер очереди

Воркер берёт задачи от клиента и отвечает сразу, а работа продолжается в фоне. Используйте `createJob` с `queue`, чтобы ограничить, сколько задач выполняется вместе, `retry` и `timeout`, чтобы сдаваться, и исходы задачи (`pending`, `success`, `fail`, `cancel`), чтобы их считать. Давайте каждому `emit` задачи один и тот же сигнал; его прерывание при остановке отменяет оставшиеся задачи.

Одна деталь важна: вызов, который ещё ждёт в очереди, когда сигнал прерывается, никогда не стартует, и задача не отправляет для него исхода. Считайте такие вызовы сами, если итоги должны сходиться.

В [примере job-worker](../../examples/job-worker) есть всё: счётчики, `GET /stats` и остановка в три шага (перестать принимать задачи, подождать, прервать остальные).

## Примеры

| Папка | Что показывает |
| ----- | -------------- |
| [`api-server`](../../examples/api-server) | Сервер Fastify поверх PokeAPI: `timeout`, `retry`, `allSettled` и прерывание, когда клиент ушёл |
| [`ws-server`](../../examples/ws-server) | Сервер WebSocket: по контроллеру на сокет, `latest` с `key`, закрытие простаивающего |
| [`job-worker`](../../examples/job-worker) | Воркер очереди: `queue`, `retry`, `timeout`, счётчики по исходам, остановка в три шага |
