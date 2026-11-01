# nanoeffects рядом с RxJS

> **Уровень E, для тех, кто знает RxJS.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

nanoeffects не заменяет RxJS, они делят работу: RxJS формирует потоки значений, nanoeffects выполняет побочные эффекты, которые запускают события. Операторы сопоставлены, поле поиска и цикл опроса показаны в обоих вариантах, перечислено то, что остаётся в RxJS.

## Разделение работы

| Задача | Использовать |
| ------ | ------------ |
| Начать запрос, когда что-то происходит, отменить его, когда приходит более новый, повторить, ограничить по времени | nanoeffects |
| Знать, какая задача что запустила, логировать и трассировать | nanoeffects ([Трассировка](tracing.md)) |
| Объединять несколько потоков, хранить накопленное значение, буферизовать, окна, слияние во времени | RxJS |
| Работать с потоком как со значением (`map`, `scan`, `combineLatest`) | RxJS |

Обработчик в nanoeffects — одна функция на событие. Конвейер в RxJS — цепочка операторов над потоком. Если ваш конвейер — несколько операторов, заканчивающихся `switchMap` и запросом, он помещается в обработчик с политикой и становится короче. Конвейер, который объединяет потоки, остаётся в RxJS.

## Соответствие

| RxJS | nanoeffects |
| ---- | ----------- |
| `mergeMap` | `bus.on(event, handler)`: каждое событие запускает задачу |
| `switchMap` | [`latest`](policies.md) |
| `exhaustMap` | [`leading`](policies.md) |
| `concatMap` | [`queue`](policies.md) |
| `debounceTime` | [`debounce`](policies.md) |
| `throttleTime` | [`throttle`](policies.md) |
| `groupBy` + `switchMap` | `latest(handler, { key })` |
| `retry`, `retryWhen` | [`retry`, `backoff`](effects.md) |
| `timeout` | [`timeout`](effects.md) |
| `interval` + `switchMap` | [`poll`](effects.md) |
| `takeUntil(stop$)` | `ctx.signal` и [`take`](effects.md), чтобы дождаться события остановки |
| `forkJoin` | [`all`](effects.md) |
| `race` | [`race`](effects.md) |
| `firstValueFrom(fromEvent(…))` | [`take(ctx, event)`](effects.md) |
| `Subject` | `bus.emit` и `bus.on` |
| `map`, `filter`, `scan`, `combineLatest`, `buffer`, `window`, `share` | остаются в RxJS |
| `distinctUntilChanged` | проверка в обработчике или в подписке на стор (см. [Сторы](stores.md)) |

Политика и оператор различаются в одном. `switchMap` отбрасывает старый внутренний поток. `latest` прерывает старую задачу через её `signal`, так что `fetch`, получивший сигнал, останавливается. Передавайте сигнал дальше, иначе работа продолжится в фоне.

## Перепишите поле поиска

Та же задача в RxJS: дождаться паузы, пропустить повторы, отменить старый запрос.

<!-- docs-check: skip - нужен rxjs, от которого проект не зависит -->
```js
// RxJS
import { fromEvent } from "rxjs";
import { debounceTime, distinctUntilChanged, map, switchMap } from "rxjs/operators";

fromEvent(input, "input")
  .pipe(
    map((event) => event.target.value),
    debounceTime(300),
    distinctUntilChanged(),
    switchMap((query) => api.searchStream(query)),
  )
  .subscribe((items) => render(items));
```

Та же задача в nanoeffects:

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

// latest: новый поиск прерывает запрос в полёте
const searchLatest = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  bus.emit("results", items);
});

// debounce: запуск после 300 мс без нового "typed"
bus.on("typed", debounce(300, searchLatest));

bus.on("results", (items) => render(items));

const input = document.querySelector("#search"); // поле поиска
input.addEventListener("input", (event) => bus.emit("typed", event.target.value));
```

Пропуска повторяющихся значений здесь нет. Добавьте в обработчик `if (query === lastQuery) return;` или оставьте этот единственный шаг в RxJS (следующий раздел).

## Перепишите цикл опроса

Проверять статус задачи каждые 5 секунд. Повторять упавшую проверку и остановиться, когда пользователь покидает экран.

Та же задача в RxJS: `timer` тикает, `exhaustMap` пропускает тик, пока идёт проверка, `retry` повторяет упавшую проверку, `takeUntil` останавливает.

<!-- docs-check: skip - нужен rxjs, от которого проект не зависит -->
```js
// RxJS
import { timer } from "rxjs";
import { exhaustMap, retry, takeUntil } from "rxjs/operators";

timer(5000, 5000)
  .pipe(
    exhaustMap(() => api.statusStream().pipe(retry({ count: 3, delay: 500 }))),
    takeUntil(leave$),
  )
  .subscribe((status) => render(status));
```

Та же задача в nanoeffects. `poll` тикает, `retry` повторяет одну проверку, а `race` завершает цикл на первом событии `"leave"`:

```js
import { createBus } from "nanoeffects";
import { poll, race, retry, take } from "nanoeffects/effects";

const bus = createBus(); // шина: события и обработчики

bus.on("watch", async (_, ctx) => {
  // одна проверка, до 3 попыток, 500 мс между ними
  const checkStatus = async () => {
    const status = await retry(ctx, () => api.status({ signal: ctx.signal }), {
      times: 3,
      delay: 500,
    });
    ctx.emit("status", status);
  };

  await race(ctx, {
    // poll без ctx: проверка каждые 5 с; waitForFn: следующая пауза начинается после окончания проверки
    polling: poll(5000, checkStatus, { waitForFn: true }),
    // take без ctx: завершается на ближайшем "leave", а race останавливает опрос
    leave: take("leave"),
  });
});

bus.on("status", (status) => render(status));

bus.emit("watch"); // старт
bus.emit("leave"); // остановка
```

От конвейера отличаются две вещи:

- `waitForFn: true` играет роль `exhaustMap`: проверки никогда не пересекаются. Без него `poll` держит ровный темп, и медленная проверка может пересечься со следующей.
- Если падают все 3 попытки, ошибка останавливает `poll`, как ошибка завершает Observable. Чтобы продолжать опрос после упавшей проверки, поймайте ошибку внутри `checkStatus` и отправьте событие `"error"`.

## Используйте оба в одном приложении

Оставьте RxJS там, где удобно мыслить потоком, а события передавайте между RxJS и шиной в любом направлении.

**Шина → RxJS.** `createObserve(bus)` даёт Observable события ([Observable](observable.md)).

**RxJS → шина.** `bus.emitter(action)` возвращает callback, отправляющий action, так что он годится как аргумент `subscribe` ([Сторы](stores.md) описывают плагин).

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";

export const bus = createBus().use(emitterPlugin()); // добавляет bus.emitter
```

```js
// filters.js
import { createAction } from "nanoeffects/actions";

export const filtersChanged = createAction("filters/changed"); // обычный action creator
```

<!-- docs-check: skip - нужен rxjs, от которого проект не зависит -->
```js
import { combineLatest } from "rxjs";
import { latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { filtersChanged } from "./filters";

// RxJS: объединить два потока в одно значение; nanoeffects этого не делает
const subscription = combineLatest([query$, category$]).subscribe(
  bus.emitter(filtersChanged), // вызывает bus.emit(filtersChanged(value))
);

// nanoeffects: один отменяемый запрос на каждое изменение фильтров
bus.on(
  filtersChanged,
  latest(async ([query, category], { signal }) => {
    const items = await api.search(query, category, { signal });
    bus.emit("results", items);
  }),
);
```

Подписка не привязана к задаче. Вызовите `subscription.unsubscribe()`, когда экран исчезает.

## Отличия

- **Нет потоков значений.** Обработчик получает одну нагрузку и запускает задачу. Нет `pipe`, нет оператора для последующих значений.
- **Прерывание заменяет отписку для работы в полёте.** Остановленная задача останавливается через её `signal`. Передайте его в `fetch` или в клиент.
- **Ошибки не часть потока.** Упавшая задача отклоняет собственный промис. Без `onError` на шине об ошибке никто больше не узнает ([Ошибки](errors.md)).
- **Нет завершения.** Шина событий не заканчивается. Задача заканчивается, когда кончается её работа или прерывается её сигнал.
- **Нет marble-тестов.** Тестируйте настоящий обработчик с поддельными таймерами.
