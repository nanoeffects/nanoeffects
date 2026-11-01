# Сохранение сигнала в обработчике

> **[Уровень B](README.md#виды-проектов)**: SPA с async UI. Сначала прочитайте: [Политики](policies.md#latest).

Политика вроде `latest` отменяет старый вызов, прерывая его `ctx.signal`. Обработчик останавливается, только если сигнал получил каждый шаг, который чего-то ждёт. Один запрос без сигнала продолжает работу, и его результат приходит позже нового. На этой странице перечислены способы потерять сигнал, что находит каждый из них до запуска кода (линтер) и во время работы (`devPlugin`), и как это исправить.

## На этой странице

- [Что делает сигнал](#что-делает-сигнал)
- [Исправление обработчика, который теряет сигнал](#исправление-обработчика-который-теряет-сигнал)
- [Передача сигнала в сложных случаях](#передача-сигнала-в-сложных-случаях)
- [Включение проверок](#включение-проверок)
- [Что проверки не видят](#что-проверки-не-видят)

## Что делает сигнал

`ctx.signal` — это `AbortSignal`. Политика прерывает его, когда вызов отменяют (новый вызов `latest`, замена в `debounce`, размонтированный модуль). Шаг останавливается, когда вы передаёте ему сигнал: `fetch(url, { signal: ctx.signal })`, `api.search(query, { signal: ctx.signal })` или весь `ctx` для эффекта, `retry(ctx, ...)`. Всё остальное продолжает работать. Шина отбрасывает то, что отменённый обработчик отправляет через `ctx.emit`, поэтому потеря проявляется поздно и тихо.

## Исправление обработчика, который теряет сигнал

Две формы, которые встречаются первыми, и исправление:

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// 1. ctx взят, а сигнал потерян: запрос не может остановиться
bus.on(
  "search",
  latest(async (query, ctx) => {
    const items = await api.search(query);
    ctx.emit("results", items);
  }),
);

// 2. один шаг передаёт сигнал, другой нет: первый не может остановиться
bus.on(
  "feed",
  latest(async (query, ctx) => {
    const news = await api.news(query);
    const posts = await api.posts(query, { signal: ctx.signal });
    ctx.emit("results", { news, posts });
  }),
);

// исправление: сигнал получает каждый шаг, который чего-то ждёт
bus.on(
  "feed/fixed",
  latest(async (query, ctx) => {
    const news = await api.news(query, { signal: ctx.signal });
    const posts = await api.posts(query, { signal: ctx.signal });
    ctx.emit("results", { news, posts });
  }),
);
```

## Передача сигнала в сложных случаях

Каждая строка — ситуация, где сигнал легко потерять. В правой колонке сказано, как его сохранить. «Линтер» — правило из [`examples/lint`](https://github.com/nanoeffects/nanoeffects/tree/main/examples/lint), которое это находит, а «devPlugin» — предупреждение во время работы ([подробнее](hmr.md#поиск-обработчика-который-игнорирует-сигнал)).

| Ситуация | Что сделать | Линтер | devPlugin |
| -------- | ----------- | :----: | :-------: |
| У обработчика нет `ctx`: `latest(async (query) => ...)` | Возьмите `(query, ctx)` и передайте `ctx.signal` | да | |
| `ctx` взят, но в запрос не передан | Передайте `{ signal: ctx.signal }` в каждый запрос | да | да |
| Один шаг передаёт сигнал, другой нет | Передайте его каждому шагу | да | да |
| Сигнал лежит в переменной: `const options = { signal: ctx.signal }` | Ничего: переменная с сигналом считается | принимает | |
| Вызовы идут вместе: `Promise.all([a(), b()])` | Передайте сигнал каждому вызову, а не одному | да | |
| `Promise.all(ids.map((id) => load(id)))` | Передайте сигнал внутри callback | да | |
| Шаг внутри эффекта: `retry(ctx, () => api.search(q))` | Callback не получает сигнал. Передайте `{ signal: ctx.signal }` в нём или используйте дочерний контекст, который он получает | да | |
| `timeout(ctx, 1000, (child) => api.search(q))` | Передайте в запрос `child` или `child.signal` | да | |
| `ctx.run((child) => api.search(q))` | Передайте `child` | да | |
| Пауза: `await new Promise((r) => setTimeout(r, 1000))` | Используйте `delay(ctx, 1000)` | да | |
| Поток: `for await (const x of api.stream(q))` | Передайте сигнал в `api.stream` | да | |
| Цепочка: `api.news(q).then(...)` | Передайте сигнал первому вызову | да | |
| Чужой сигнал: `AbortSignal.timeout(5000)` или сигнал вашего `AbortController` | Объедините его с сигналом обработчика: `AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)])` | да | |
| Чтение тела ответа: `await response.json()` | Ничего: сигнал запроса останавливает и его | принимает | |
| Библиотека, которая не принимает сигнал (кэш, локальная база) | Исключите её параметром `ignore` правила или комментарием, который отключает правило | `ignore` | |
| Сигнал подключён вручную: `signal.addEventListener("abort", ...)` | Ничего: такой обработчик не проверяется по шагам | принимает | |
| `bus.emit` в обработчике | Используйте `ctx.emit`: только его отбрасывают после отмены обработчика | да | |
| Результаты отправлены после отмены | Обработчик проигнорировал сигнал. Передайте его или проверьте `ctx.signal.aborted` | | да |
| `ctx.on` после отмены | То же | | да |

Строки про паузу и эффекты в коде:

```js
import { createBus } from "nanoeffects";
import { delay, retry, timeout } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

bus.on(
  "search",
  latest(async (query, ctx) => {
    // delay — пауза, которая останавливается вместе с ctx, в отличие от new Promise(setTimeout)
    await delay(ctx, 300);

    // retry — попытки останавливаются вместе с ctx, но запросу тоже нужен сигнал
    const items = await retry(ctx, () => api.search(query, { signal: ctx.signal }));

    // timeout — callback получает дочерний контекст: передайте его запросу
    const details = await timeout(ctx, 5000, (child) => api.details(query, child));

    ctx.emit("results", { items, details });
  }),
);
```

Вызовы, которые идут вместе, и сигнал, который объединяется с другим:

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

bus.on(
  "feed",
  latest(async (query, ctx) => {
    // каждый вызов группы получает сигнал, а не только первый
    const [news, posts] = await Promise.all([
      api.news(query, { signal: ctx.signal }),
      api.posts(query, { signal: ctx.signal }),
    ]);

    // AbortSignal.any — останавливается вместе с обработчиком или через 5 секунд, что наступит раньше
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)]);
    const details = await api.details(query, { signal });

    ctx.emit("results", { news, posts, details });
  }),
);
```

## Включение проверок

**Пока вы пишете код.** В [`examples/lint`](https://github.com/nanoeffects/nanoeffects/tree/main/examples/lint) есть правило для ESLint и oxlint (один файл, без зависимостей) и два плагина GritQL для Biome. Скопируйте файл, включите правило и передайте ему имена вызовов, которые нельзя отменить:

<!-- docs-check: skip - файл настройки проекта читателя -->
```js
// eslint.config.mjs
import nanoeffects from "./nanoeffects-lint.mjs";

export default [
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    plugins: { nanoeffects },
    rules: {
      "nanoeffects/policy-handler-uses-signal": [
        "warn",
        // вызовы без сигнала, которых можно просто дождаться
        { ignore: ["cache.get", "storage.*"] },
      ],
    },
  },
];
```

Для oxlint перечислите файл в `jsPlugins` файла `.oxlintrc.json` и используйте то же имя правила. Для Biome перечислите два файла `.grit` в `plugins`. Плагины Biome читают текст, поэтому находят прямые шаги (первые строки таблицы) и пропускают более глубокие: вызовы `Promise.all`, callback эффектов, `for await`, паузу и ключ объекта с параметрами.

**Пока код работает.** `devPlugin` один раз предупреждает, когда обработчик отправляет событие или подписывается через `ctx.on` после того, как его задачу отменили:

```js
import { createBus } from "nanoeffects";
import { devPlugin } from "nanoeffects/dev";

const bus = createBus();

// devPlugin — предупреждает об обработчике, который продолжил работу после отмены; в production ничего не делает
bus.use(devPlugin());
```

## Что проверки не видят

- **Обработчик, записанный не на месте.** Линтер не читает `latest(searchHandler)` и `latest(withLogging(async (query, ctx) => ...))`.
- **Вызов, который игнорирует переданный сигнал.** Правило видит, что вы его передали, но не знает, что с ним делает вызываемый код.
- **Обработчик, который ничего не отправляет.** `devPlugin` замечает потерянный сигнал по emit после отмены; обработчик, который пишет данные в другое место, видит только линтер.
- **Затенённые имена.** Правило не анализирует области видимости, поэтому внутренняя переменная `signal` может скрыть потерю сигнала.
