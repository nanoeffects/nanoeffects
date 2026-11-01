# Превращение событий в Observable

> **Уровень F.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаг 1.

Страница для приложения, которое уже работает с Observable или RxJS и получает событие шины как поток. Если вы начинаете с нуля, берите `bus.on` с политиками: они отменяют работу и видны в трассировках.

В той же точке входа есть `events`: он отдаёт событие в цикл `for await` и не требует библиотеки потоков. См. [Чтение события циклом `for await`](#читайте-событие-циклом-for-await).

`createObserve(bus)` из `nanoeffects/observable` превращает событие шины в Observable по предложению TC39 (`subscribe`, `unsubscribe`, `Symbol.observable`). RxJS и другие библиотеки потоков принимают его как есть. Сама точка входа от них не зависит.

## Превратите событие в поток

Проблема: поле поиска отправляет `typed` на каждую клавишу. Нужно дождаться паузы и пропустить повторы знакомыми операторами.

<!-- docs-check: skip - нужен rxjs, от которого проект не зависит -->
```js
import { createBus } from "nanoeffects";
import { createObserve } from "nanoeffects/observable";
import { from } from "rxjs";
import { debounceTime, distinctUntilChanged } from "rxjs/operators";

const bus = createBus(); // шина: события и обработчики
const observe = createObserve(bus); // observe(event) даёт Observable на имя события

const typed$ = from(observe("typed")); // RxJS оборачивает его через from()

const subscription = typed$
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((query) => bus.emit("search", query)); // обратно в шину
```

- `observe(event)` возвращает Observable нагрузок этого события. Каждый `subscribe` — отдельный `bus.on`; `unsubscribe()` его снимает.
- `subscribe` принимает функцию или объект с `next`.
- Типы следуют карте событий: `observe("typed")` — это `Observable<string>`, когда `typed` несёт строку.

## Отправьте поток в шину

Проблема: `.subscribe((value) => bus.emit(action(value)))` повторяет шину и action в каждой подписке. `bus.emitter(action)` из `emitterPlugin` возвращает готовый callback для `subscribe`. Он подходит любому источнику с функцией `next`: потоку RxJS, callback стора, DOM-обработчику.

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";

export const bus = createBus().use(emitterPlugin()); // добавляет bus.emitter
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("search/queryChanged"); // обычный action creator
```

<!-- docs-check: skip - нужен rxjs, от которого проект не зависит -->
```js
import { fromEvent } from "rxjs";
import { debounceTime, distinctUntilChanged, map } from "rxjs/operators";
import { bus } from "./bus";
import { queryChanged } from "./search";

const input = document.querySelector("#search"); // поле поиска

const subscription = fromEvent(input, "input")
  .pipe(
    map((event) => event.target.value),
    debounceTime(300),
    distinctUntilChanged(),
  )
  .subscribe(bus.emitter(queryChanged)); // вызывает bus.emit(queryChanged(value))

bus.on(queryChanged, (query) => console.log("search for", query));
```

Observable может быть откуда угодно, не только из `createObserve`. `subscription.unsubscribe()` останавливает его; шина о нём не знает. Передавайте callback в `subscribe` как есть и не вызывайте `bus.emitter(...)` внутри операторов на каждое значение.

## Читайте и пишите одно событие через Subject

Проблема: `createObserve` только читает. Коду для потоков часто нужно ещё и отправлять значения в то же событие, а передавать для этого шину и имя события неудобно.

`Subject` — одно событие шины как один объект. `subscribe` слушает, `next` отправляет. В нём нет `complete`, `error` и повтора значений: событие шины не заканчивается, а шина значений не хранит.

```js
import { createBus } from "nanoeffects";
import { Subject } from "nanoeffects/observable";

const bus = createBus(); // шина: события и обработчики

const typed = new Subject(bus, "typed"); // Subject — событие "typed" как поток, в который можно ещё и писать

const subscription = typed.subscribe((text) => console.log(text)); // как bus.on("typed", …)
typed.next("hello"); // как bus.emit("typed", "hello"): срабатывают и обработчики bus.on, и подписчики
subscription.unsubscribe(); // снимает только эту подписку
```

- `next` работает и отдельно от subject, поэтому `input.addEventListener("input", (event) => typed.next(event.target.value))` и `store.subscribe(typed.next)` обёртки не требуют.
- Подписчик, добавленный позже, не получает значение, отправленное раньше. Если он должен получить значение, добавьте в RxJS `startWith` или `shareReplay`.
- RxJS принимает `Subject` так же, как `createObserve`: `from(typed)`. Это не `Subject` из RxJS (нет `error`, `complete` или `pipe`), поэтому он не подходит там, где нужен тот тип.

### Расширьте его для именованного потока

Проблема: имя события повторяется везде, где создаётся поток. Подкласс фиксирует его один раз.

```js
import { createBus } from "nanoeffects";
import { Subject } from "nanoeffects/observable";

class TypedText extends Subject {
  constructor(bus) {
    super(bus, "typed"); // событие закреплено классом
  }

  next(text) {
    super.next(text.trim()); // метод подкласса заменяет метод Subject
  }
}

const bus = createBus(); // шина: события и обработчики
const typed = new TypedText(bus);
typed.next("  hello "); // отправляет "typed" со значением "hello"
```

### Используйте его внутри класса с шиной

У класса, созданного через `extendBus`, есть свои `on` и `emit`. Передайте `this` как источник, и подписка принадлежит экземпляру, так что `dispose()` её завершает ([Классы с шиной](oop.md)).

## Делайте работу в обработчике, а не в `switchMap`

Observable хорошо формирует значения. Запрос лучше выполнять в обработчике с политикой: у него есть `signal`, и трассировка его показывает. Разделите работу: RxJS заканчивается на значении, шина запускает запрос.

<!-- docs-check: skip - нужен rxjs, от которого проект не зависит -->
```js
import { latest } from "nanoeffects/policies";

// RxJS: сформировать значения (debounce, пропуск повторов), затем передать их шине
from(observe("typed"))
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((query) => bus.emit("search", query));

// nanoeffects: один отменяемый запрос; новый "search" прерывает старый
bus.on(
  "search",
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal });
    bus.emit("results", items);
  }),
);
```

`switchMap` отбрасывает старый внутренний поток. `latest` прерывает старую задачу через `signal`, так что `fetch`, получивший сигнал, действительно останавливается.

## Читайте событие циклом `for await`

Проблема: задаче нужно обрабатывать нагрузки одного события по порядку и остановиться, когда экран закроется. `take` ждёт одну нагрузку, а в обработчике негде разместить цикл.

`events(source, event, options)` из `nanoeffects/observable` возвращает асинхронный итератор нагрузок. Он слушает с момента вызова, так что нагрузка, пришедшая до первого чтения, сохраняется. `source` — шина или контекст задачи; с контекстом цикл заканчивается ещё и когда задача прерывается.

```js
import { createBus } from "nanoeffects";
import { events } from "nanoeffects/observable";

const bus = createBus();
const controller = new AbortController();

// events — нагрузки "query/changed" по одной; хранит последние 3, пока цикл занят
const queries = events(bus, "query/changed", {
  signal: controller.signal,
  buffer: 3,
});

async function watchQueries() {
  for await (const query of queries) {
    console.log("search for", query); // выполняется один раз на нагрузку, по порядку
  }
}

watchQueries().catch((reason) => console.log("stopped:", reason)); // прерывание отклоняет цикл
bus.emit("query/changed", "cat");
controller.abort("screen closed"); // цикл заканчивается с этой причиной
```

| Параметр | Что делает | По умолчанию |
| -------- | ---------- | ------------ |
| `signal` | Завершает цикл. Ожидающее чтение отклоняется с причиной прерывания. | нет |
| `buffer` | Наибольшее число нагрузок, которые хранятся, пока цикл занят. | `Infinity` |
| `overflow` | Какая нагрузка уходит, когда буфер полон: `"drop-oldest"` или `"drop-newest"`. | `"drop-oldest"` |

- `break`, `return` и выброс ошибки внутри цикла отписывают обработчик.
- Без `buffer` цикл, который никогда не читает, хранит каждую нагрузку. Для медленного цикла задайте `buffer`.
- Событие шины не заканчивается, поэтому цикл заканчивается только по `break`, `signal` или задаче.
- Внутри задачи `events(ctx, "query/changed")` не нуждается в `signal`: окончание задачи и есть конец.

## Преобразуйте обратно в поток или промис

| Что нужно | Как писать |
| --------- | ---------- |
| Поток событий с операторами | `from(observe("event"))` |
| Следующее событие как промис | `firstValueFrom(from(observe("event")))`; внутри задачи то же делает `take(ctx, "event")` и учитывает прерывание |
| События шины как класс RxJS `Observable` (для `instanceof` или `pipe` как метода) | `new Observable((subscriber) => observe("event").subscribe(subscriber))` |
| Прерывание задачи как поток | `fromEvent(ctx.signal, "abort")`, для `takeUntil` |
| Последнее значение для новых подписчиков | `from(observe("event")).pipe(shareReplay(1))`; Observable сам ничего не воспроизводит |

События, сработавшие до `subscribe`, теряются: Observable горячий, как `bus.on`. Добавьте `startWith(initial)` или `shareReplay`, когда позднему подписчику нужно значение.

## Завершите подписку

Подписка из `observe` не привязана к задаче и сама не завершится. Выберите один способ:

<!-- docs-check: skip - нужен rxjs, от которого проект не зависит -->
```js
import { fromEvent, from } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { onAbort } from "nanoeffects/effects";

bus.on("screen-opened", (_, ctx) => {
  // takeUntil: остановить поток, когда задача прервётся
  from(observe("typed"))
    .pipe(takeUntil(fromEvent(ctx.signal, "abort")))
    .subscribe((query) => bus.emit("search", query));

  // или: onAbort вызывает unsubscribe за вас
  const subscription = observe("scrolled").subscribe(updatePosition);
  onAbort(ctx, subscription.unsubscribe);
});
```

Вне задачи вызовите `subscription.unsubscribe()` сами, когда экран исчезает, или используйте сигнал модуля.

## Знайте ограничения

- Поток никогда не завершается и не падает: приходят только события. Ошибку вашего подписчика шина обрабатывает, только если задан `onError` ([Ошибки](errors.md)).
- `observe` обращается к шине при вызове `subscribe`, а не при создании. Создайте его один раз и вызывайте сколько нужно.
- Операторы, хранящие состояние (`scan`, `buffer`, `window`), живут в RxJS. Шина значений не хранит. Полное разделение работы см. в [nanoeffects рядом с RxJS](migrating-from-rxjs.md).
