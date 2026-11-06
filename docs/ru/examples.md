# Примеры

> **[Уровни A–F](README.md#виды-проектов)**: для любого проекта.

Примеры, которые можно запустить в браузере и прочитать. Каждая папка лежит в `examples/` репозитория и проверяется типами вместе с проектом. Два примера разобраны по шагам: [Чат](chat-example.md) и [Виджет чата](chat-widget.md).

## Запуск в браузере

Все три — одно и то же поле поиска: печатайте быстро, и стартует один запрос (`debounce`); печатайте снова, пока запрос идёт, и старый прерывается (`latest`). StackBlitz запускает их без установки.

| Папка | Что внутри |
| ------ | ---------- |
| [`playground`](../../examples/playground) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground) | Обычный DOM и один файл: самая маленькая установка. Страница показывает запросы, поэтому видно, как прерывается старый. |
| [`playground-react`](../../examples/playground-react) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground-react) | Тот же поиск в компоненте React, шина вне React. |
| [`playground-devtools`](../../examples/playground-devtools) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground-devtools) | Тот же поиск, emit и остановленные вызовы уходят в Redux DevTools. |

## Большие проекты

Проекты на React и TypeScript показывают, где живёт логика, когда в приложении несколько фич.

| Папка | Что внутри |
| ------ | ---------- |
| [`chat`](../../examples/chat) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/chat) | Комнаты, история под `latest`, отправка по порядку через `queue` и `retry`, поиск через `allSettled`, опрос через `poll`. Разобран в [Чате](chat-example.md). |
| [`pokedex`](../../examples/pokedex) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/pokedex) | Настоящие запросы к PokeAPI: поиск с `debounce`, `latest`, `timeout` и `retry`, способности через `allSettled`. |
| [`spells`](../../examples/spells) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/spells) | Самый маленький пример: поиск в одном файле, один action с обработчиком. |
| [`countdown`](../../examples/countdown) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/countdown) | «Успей забрать скидку за 15 секунд»: `race` между кнопкой и таймером, а «Restart» завершает старую сессию. |
| [`spells`](../../examples/spells) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/spells) | Самый маленький пример: поиск в одном файле, один action с обработчиком. |
| [`chat-widget`](../../examples/chat-widget) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/chat-widget) | Чат за кнопкой-лаунчером: открытие подключает один модуль, закрытие отключает. Разобран в [Виджете чата](chat-widget.md). |
| [`counter`](../../examples/counter) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/counter) | Счётчик из руководства redux-saga: без store и с Redux Toolkit. |
| [`rickandmorty`](../../examples/rickandmorty) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/rickandmorty) | Персонажи с React Query: запросы — actions, которые получают его сигнал прерывания. |
| [`trades`](../../examples/trades) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/trades) | Живой поток по WebSocket: `retry`, `latest` и `throttle`. |

## Примеры для backend

Небольшие приложения на [Fastify](https://fastify.dev) без базы данных. Нужен Node 18 или новее: выполните `npm install` и `npm start` в папке. Подробнее: [Остановка работы на backend](server.md).

| Папка | Что внутри |
| ------ | ---------- |
| [`api-server`](../../examples/api-server) | Сервер поверх PokeAPI: `timeout`, `retry`, `allSettled` и прерывание, когда клиент ушёл. |
| [`job-worker`](../../examples/job-worker) | Воркер очереди: `queue`, `retry`, `timeout`, счётчики по исходам job. |
| [`ws-server`](../../examples/ws-server) | Сервер WebSocket: по контроллеру на сокет, `latest` с `key`. |

## Рецепты

Каждый файл — одна задача в виде короткой программы с комментарием у каждого вызова nanoeffects.

| Файл | Задача | Документация |
| ---- | ------ | ------------ |
| [`search.ts`](../../examples/search.ts) | Поле поиска, которое ждёт паузы и прерывает старый запрос. | [Политики](policies.md) |
| [`backoff.ts`](../../examples/backoff.ts) | Повтор ненадёжного запроса с растущей паузой. | [Эффекты](effects.md#backoff) |
| [`registration-form.ts`](../../examples/registration-form.ts) | Форма регистрации: проверка имени без гонки. | [Форма на React](react.md) |
| [`scope.ts`](../../examples/scope.ts) | Action со своими эффектами и тест, который подменяет один из них. | [Работа с контекстом](context.md) |
| [`modules.ts`](../../examples/modules.ts) | Доменная логика без UI, подключается и отключается как единое целое. | [Actions](actions.md) |
| [`redux.ts`](../../examples/redux.ts) | Actions Redux Toolkit, которые попадают и на шину. | [State managers](stores.md) |
| [`guide.ts`](../../examples/guide.ts) | Код каждого шага руководства. | [Руководство](guide.md) |

## Проекты на TypeScript

| Папка | Что внутри |
| ------ | ---------- |
| [`typescript`](../../examples/typescript) | Один раз назвать карту событий и использовать её в модулях и actions. |
| [`typescript-context`](../../examples/typescript-context) | Дать `ctx` поля вашей шины и типизировать их из одного места. |
