# Эффекты и отмена

> **Уровень C.** Сначала прочитайте: [Политики](policies.md).

Выберите **один** помощник под свою задачу, остальное — справочник.

Прерывание лишь поднимает флаг: остановиться должен ваш код. Начните с `retry` и `timeout` на обработчике (см. [Руководство, шаг 5](guide.md#5-добавьте-retry-и-timeout)).

## На этой странице

- [Найдите эффект](#найдите-эффект)
  - [`retry`](#retry), [`timeout`](#timeout), [`poll`](#poll), [`backoff`](#backoff), [`delay`](#delay), [`cancellable`](#cancellable), [`take`](#take), [`all`](#all), [`allSettled`](#allsettled), [`race`](#race), [`effectsPlugin`](#effectsplugin)
- [Оберните обработчик в retry и timeout](#оберните-обработчик-в-retry-и-timeout)
  - [Параметры retry, timeout и poll](#параметры-retry-timeout-и-poll)
- [Растущая пауза между повторами](#растущая-пауза-между-повторами)
- [Положите выбранные эффекты на `ctx`](#положите-выбранные-эффекты-на-ctx)
- [Привяжите промис к сигналу задачи](#привяжите-промис-к-сигналу-задачи)
- [Выполните очистку при прерывании](#выполните-очистку-при-прерывании)
- [Слушайте события внутри задачи](#слушайте-события-внутри-задачи)
- [Дождитесь следующего события через `take`](#дождитесь-следующего-события-через-take)
- [Запуск нескольких starters вместе](#запуск-нескольких-starters-вместе)
- [Передайте `ctx` вне задачи](#передайте-ctx-вне-задачи)

## Найдите эффект

`ctx` ниже — контекст задачи.

### `retry`

Запускает функцию снова после ошибки. `retry(fn, options?)` оборачивает обработчик, `retry(ctx, fn, options?)` запускается внутри него. Параметры: [Параметры retry, timeout и poll](#параметры-retry-timeout-и-poll).

### `timeout`

Отклоняется с `TimeoutError`, если работа длится дольше `ms`. `timeout(ms, handler)` оборачивает обработчик, `timeout(ctx, ms, starter)` запускается внутри него. Подробности: [Оберните обработчик в retry и timeout](#оберните-обработчик-в-retry-и-timeout).

### `poll`

Вызывает функцию снова и снова с интервалом. `poll(ms, fn, options?)` или `poll(ctx, fn, ms)`. Параметры: [Параметры retry, timeout и poll](#параметры-retry-timeout-и-poll).

### `backoff`

Делает паузу между повторами растущей, с ограничением и джиттером. `backoff(options)` возвращает `(attempt) => ms`. Рецепт: [Растущая пауза между повторами](#растущая-пауза-между-повторами).

### `delay`

Ждёт `ms` и отклоняется при прерывании. `delay(ctx, ms)`. Рецепт: [Привяжите промис к сигналу задачи](#привяжите-промис-к-сигналу-задачи).

### `cancellable`

Промис, привязанный к сигналу задачи, как `new Promise`, с очисткой через `onCancel`. `cancellable(ctx, executor)`. Рецепт: [Привяжите промис к сигналу задачи](#привяжите-промис-к-сигналу-задачи).

### `take`

Ждёт следующее событие шины. `take(ctx, "event")`. Рецепт: [Дождитесь следующего события через `take`](#дождитесь-следующего-события-через-take).

### `all`

Запускает starters вместе; одна ошибка отменяет остальные. `all(ctx, effects)`. Рецепт: [Запуск нескольких starters вместе](#запуск-нескольких-starters-вместе).

### `allSettled`

Ждёт каждый starter и не падает из-за одного. `allSettled(ctx, effects)`. Рецепт: [Запуск нескольких starters вместе](#запуск-нескольких-starters-вместе).

### `race`

Завершается с первым закончившимся starter и отменяет остальные. `race(ctx, effects)`. Рецепт: [Запуск нескольких starters вместе](#запуск-нескольких-starters-вместе).

### `effectsPlugin`

Добавляет выбранные эффекты в `ctx`, поэтому обработчик вызывает их без передачи `ctx`. `bus.use(effectsPlugin({ race, all, delay }))`. Рецепт: [Положите выбранные эффекты на `ctx`](#положите-выбранные-эффекты-на-ctx).

## Оберните обработчик в retry и timeout

У `retry`, `timeout` и `poll` две формы:

- **Обёртка задачи**: принимает функцию `(payload, ctx) => result` и возвращает такую же. Передаётся в `on` рядом с политиками (в аргументах нет `ctx`).
- **Вызов внутри тела**: первым аргументом принимает `ctx`.

Первый аргумент различает их: функция (`retry`), число (`timeout`) или число/функция (`poll`) означает обёртку; объект — это `ctx`.

```js
import { createBus } from "nanoeffects";
import { poll, retry, timeout } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();
const loadUser = (id, { signal }) => fetchUser(id, { signal });

// timeout — одна попытка должна уложиться в 5 с
const loadOnce = timeout(5000, loadUser);
// retry — до 4 попыток с растущей паузой
const loadWithRetry = retry(loadOnce, {
  times: 4,
  delay: (attempt) => 2 ** attempt * 100,
  shouldRetry: (error) => !isFatal(error),
});
// latest — новая загрузка прерывает старую цепочку повторов
bus.on("load", latest(loadWithRetry));

// poll — вызывать refresh каждые 10 с, пока задача не прервётся
bus.on("watch", poll(10_000, (_, { signal }) => refresh({ signal })));

// ctx.run — запустить обёрнутую задачу как дочернюю (прерывается вместе с обработчиком)
bus.on("open", async (id, ctx) => {
  const load = retry(timeout(5000, loadUser));
  const user = await ctx.run(load, id);
  ctx.emit("opened", user);
});

// форма с ctx первым — один вызов внутри тела
bus.on("load", async (id, ctx) => {
  const user = await retry(
    ctx,
    () => fetchUser(id, { signal: ctx.signal }),
    { times: 4 },
  );
  const data = await timeout(ctx, 5000, (child) => fetchData(id, child));
  await poll(ctx, () => refresh(), 10_000);
  ctx.emit("ready", { user, data });
});
```

Обёртка подходит для целого обработчика или `ctx.run`. Форма с `ctx` — для одного вызова в теле обработчика.

Каждая попытка или вызов обёртки получает свой дочерний контекст. Прерывание вызывающего доходит до него. Прерывание одной попытки (таймаут) до вызывающего не доходит. Номер попытки передаётся только в форме с `ctx`.

### Параметры retry, timeout и poll

**`retry`**

- `times` — всего попыток (по умолчанию `3`).
- `delay` — число или `(attempt, error) => ms`.
- `shouldRetry(error, attempt)` — остановиться раньше.
- `fn` получает номер попытки, начиная с `1`.
- При прерывании отклоняется с причиной прерывания.

**`timeout`**

- Ошибка — `DOMException` с именем `TimeoutError` (как у `AbortSignal.timeout`).
- Отклоняется, даже если starter игнорирует свой сигнал.

**`poll`** (как `interval` в patronum)

- Первый вызов через `ms`. `leading: true` вызывает ещё и сразу.
- Следующие тики держат ровный темп независимо от длительности `fn`, поэтому медленный `fn` может пересечься со следующим вызовом.
- `waitForFn: true` начинает каждую паузу, когда вызов закончился: вызовы никогда не пересекаются.
- `fn` получает номер вызова, начиная с `0`.
- Ошибка из `fn` останавливает опрос и отклоняет промис. Прерывание завершает его нормально и очищает таймер.

Пауза может быть функцией везде, где задаётся время. Для повторов с ограничением и джиттером см. [Растущая пауза между повторами](#растущая-пауза-между-повторами):

```js
import { createBus } from "nanoeffects";
import { delay, poll, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("sync", async (_, ctx) => {
  retry(ctx, load, { times: 5, delay: (attempt) => 2 ** attempt * 100 }); // 200, 400, 800, …
  poll(ctx, refresh, (call) => Math.min(1000 * 2 ** call, 60_000)); // замедляется до раза в минуту
  await delay(ctx, () => 200 + Math.random() * 200); // 200–400 мс
});
```

Все три трассируются: эффект — это группа (`retry`, `timeout`, `poll`), а каждая попытка или вызов — дочерний `run`.

## Растущая пауза между повторами

Пауза нужна, когда backend или сеть падают под нагрузкой. Повтор сразу или с фиксированной паузой возвращает всех клиентов в один момент и не даёт backend подняться. Делайте паузу длиннее с каждой попыткой и добавьте джиттер, чтобы клиенты разошлись.

Короче всего — функция `delay`. Импорт ей не нужен:

```js
import { retry } from "nanoeffects/effects";

const loadWithRetry = retry(loadUser, {
  times: 5,
  delay: (attempt) => 2 ** attempt * 100, // 200, 400, 800, 1600 мс
});
```

Нужны ограничение и джиттер? Постройте функцию через `backoff`:

```js
import { backoff, retry } from "nanoeffects/effects";

const loadWithRetry = retry(loadUser, {
  times: 5,
  // backoff — пауза 200, 400, 800, … мс, не больше 5 с, случайная её часть
  delay: backoff({
    base: 200,
    max: 5000,
    jitter: true,
  }),
});
```

| Параметр | Значение |
| -------- | -------- |
| `base` | пауза перед второй попыткой, в мс (по умолчанию `100`) |
| `factor` | каждая пауза во столько раз длиннее (по умолчанию `2`) |
| `max` | самая длинная пауза, в мс (по умолчанию нет) |
| `jitter` | `true` выбирает случайную паузу от 0 до вычисленной (по умолчанию `false`) |

- С `jitter: true` пауза может быть близка к 0, поэтому считайте `base` масштабом, а не минимумом.
- `retry` считает попытки с 1. `poll` считает вызовы с 0, поэтому у `poll` первая пауза равна `base / factor`.
- Результат — обычная функция `(attempt) => ms`, так что она подходит и для `delay(ctx, …)`.

## Положите выбранные эффекты на `ctx`

Если обработчики часто вызывают одни и те же помощники, положите их на задачу один раз. Обработчик достанет их деструктуризацией, как `signal`, без аргумента `ctx`. В бандл попадают только переданные эффекты ([точки входа пакета](package.md)).

```js
import { createBus } from "nanoeffects";
import { all, delay, effectsPlugin, race } from "nanoeffects/effects";

// effectsPlugin — добавить race, all и delay в контекст каждой задачи
const effects = effectsPlugin({ race, all, delay });

// use возвращает ту же шину, типизированную новыми полями
const bus = createBus().use(effects);

bus.on("load", async (id, { race, all, delay }) => {
  // race — то же, что race(ctx, …)
  const result = await race({
    // child — контекст этого starter; в нём есть `signal`, поэтому запрос останавливается вместе с гонкой
    data: (child) => fetchData(id, child),
    // starter получает свой child с теми же привязанными эффектами, так что delay(5000) останавливается вместе с гонкой
    timeout: ({ delay }) => delay(5000),
  });
  if ("timeout" in result) throw new Error("timed out");

  // all — то же, что all(ctx, …)
  const { user, posts } = await all({
    user: (child) => fetchUser(id, child),
    posts: (child) => fetchPosts(id, child),
  });
});
```

- Ключ — это имя, под которым эффект попадает на `ctx`. `race`, `all`, `allSettled`, `take` и `delay` типизированы вручную.
- Ваша собственная функция тоже подходит, если её первый параметр — `{ signal }` (*эффект*): `effectsPlugin({ fetchJson })` даст `ctx.fetchJson(url)`. TypeScript убирает первый параметр из её типа; для обобщённой функции см. [Сохранение обобщённого эффекта обобщённым](scope.md#сохраните-обобщённый-эффект-обобщённым).
- Не добавляйте `retry`, `timeout` и `poll`: привязанные к задаче, они путались бы со своими обёртками обработчика.
- Поля из `createBus({ context })` остаются. TypeScript отклоняет эффект, чьё имя уже занято полем контекста шины, в том числе добавленным более ранним `effectsPlugin`.
- Свободные формы продолжают работать: `race(ctx, …)`.

## Привяжите промис к сигналу задачи

`delay(ctx, ms)` ждёт и отклоняется при прерывании (`ms` может быть функцией).

`cancellable(ctx, executor)` — промис, привязанный к сигналу задачи. Он работает как `new Promise`, но executor получает `{ resolve, reject, onCancel }`.

```js
import { createBus } from "nanoeffects";
import { cancellable } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// cancellable — промис, привязанный к сигналу задачи; onCancel для очистки
// latest — новое ожидание прерывает старый таймер
bus.on(
  "wait",
  latest((_, ctx) => {
    return cancellable(ctx, ({ resolve, onCancel }) => {
      const timer = setTimeout(resolve, 5000);
      onCancel(() => clearTimeout(timer));
    });
  }),
);
```

- Если задача прервётся до завершения промиса, очистки выполнятся (последняя зарегистрированная первой), а промис отклонится с причиной прерывания.
- Если задача уже прервана, executor не запускается.
- После завершения промиса подписка на прерывание снимается, а очистки отбрасываются.

## Выполните очистку при прерывании

`onAbort(ctx, fn)` запускает `fn(reason)` при прерывании (сразу, если уже прервано) и возвращает функцию отписки.

```js
import { createBus } from "nanoeffects";
import { onAbort } from "nanoeffects/effects";

const bus = createBus();

bus.on("connect", (url, ctx) => {
  const socket = new WebSocket(url);
  // onAbort — выполнить очистку, когда эта задача прервётся
  onAbort(ctx, () => socket.close());
});
```

## Слушайте события внутри задачи

У контекста задачи есть `on` и `off`, как у шины. Подписка, сделанная через `ctx.on`, заканчивается, когда задача прерывается:

```js
import { createBus } from "nanoeffects";

const bus = createBus();

bus.on("watch", (_, ctx) => {
  ctx.on("tick", (n) => console.log(n)); // исчезает, когда эта задача прерывается
});
```

- Возвращаемая функция отписывает раньше. После прерывания `ctx.on` ничего не делает.
- Под `latest` подписки вытесненного запуска заканчиваются вместе с ним.
- `ctx.off(event)` очищает всех обработчиков события на шине, а не только обработчиков этой задачи.

## Дождитесь следующего события через `take`

`take(ctx, event, options?)` ждёт следующее `event` и завершается с его нагрузкой. `event` — имя события или action creator, как для `bus.on`:

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { take, timeout } from "nanoeffects/effects";

const bus = createBus();
const stopRequested = createAction("stop"); // событие с именем; его вызов строит action

bus.on("login", async (user, ctx) => {
  const reason = await take(ctx, "logout"); // завершается на следующем logout
  cleanup(user, reason);

  // action creator работает так же, а тип его нагрузки — тип результата
  const stopped = await take(ctx, stopRequested);
  console.log(stopped);

  // ждать подходящее событие, но не дольше 5 с
  const id = await timeout(
    ctx,
    5000,
    take("saved", { predicate: (savedId) => savedId === draft.id }), // take без ctx: starter
  );
});
```

- Видит только события, отправленные после вызова, берёт одно и отписывается.
- С action creator результат имеет тип его нагрузки. Action creator без типа нагрузки (`createAction("saved")`) берёт тип из карты событий шины.
- `options.predicate` пропускает нагрузки, которые он отклоняет. В TypeScript type guard (`(payload): payload is Admin`) сужает тип результата.
- `options.signal` останавливает ожидание. Внутри `race`, `all` или `timeout` он не нужен: группа и так останавливает starter, так что пишите `take("saved")` без параметров.
- При прерывании задачи или `options.signal` отписывается и отклоняется с причиной прерывания.

## Запуск нескольких starters вместе

`all(ctx, effects)` запускает starters вместе. Одна ошибка отменяет остальные. Форма входа (объект или массив) сохраняется в результате.

`allSettled(ctx, effects)` ждёт каждый starter и не падает из-за одного. Каждый результат — `{ status: "fulfilled", value }` или `{ status: "rejected", reason }`. Когда starter падает, ничего не отменяется. Отклонить его может только прерывание `ctx`.

```js
import { createBus } from "nanoeffects";
import { allSettled } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  const { user, posts } = await allSettled(ctx, {
    user: (child) => fetchUser(id, child),
    posts: (child) => fetchPosts(id, child),
  });

  if (user.status === "fulfilled") {
    render(user.value);
  }
});
```

`race(ctx, effects)` завершается с первым закончившимся starter и отменяет остальные.

```js
import { createBus } from "nanoeffects";
import { delay, race, take } from "nanoeffects/effects";

const bus = createBus();

bus.on("save", async (draft, ctx) => {
  // race — побеждает первый закончивший starter, другой отменяется
  const result = await race(ctx, {
    waited: delay(1000), // delay без ctx — starter: race даёт ему свой child
    cancelled: take("cancel"), // take без ctx — то же самое, ждёт следующий "cancel"
  });

  if ("waited" in result) {
    ctx.emit("saved", draft);
  }
});
```

**`delay` и `take` без `ctx` — готовые starters.** В группе `delay(1000)` и `take("cancel")` равны `(child) => delay(child, 1000)` и `(child) => take(child, "cancel")`. Группа вызывает их с child, поэтому ожидание останавливается вместе с группой. Берите эту форму внутри `race`, `all`, `allSettled` и `timeout`. В обычном коде обработчика пишите `delay(ctx, 1000)`. Starter ждёт, только когда его вызывает группа: `await delay(1000)` сам по себе не сработает, потому что это функция, а не промис. Пишите `take("cancel")` прямо в группе, как выше. Starter в переменной вне группы не знает событий вашей шины, и в TypeScript их нужно назвать самому: `const cancelled: StarterOf<Events> = take("cancel")` (`StarterOf` экспортирует `nanoeffects/effects`).

Обёртка `retry`, `timeout` или `poll` — тоже starter. Группа вызывает её с child, а функция внутри получает `undefined` вместо нагрузки и child вместо контекста. Нужные данные передайте через замыкание:

```js
import { createBus } from "nanoeffects";
import { delay, race, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  const result = await race(ctx, {
    // retry без ctx — starter: до 3 попыток, каждая с сигналом child
    user: retry((_, { signal }) => fetchUser(id, { signal }), { times: 3 }),
    // delay без ctx — проигравший отменяется, когда другой заканчивает
    waited: delay(5000),
  });

  if ("user" in result) {
    render(result.user);
  }
});
```

Вызов с нагрузкой и контекстом, `(payload, ctx)`, — это задача (Task) для `bus.on` и `ctx.run`; она не меняется. Поэтому у `retry`, `timeout` и `poll` три формы вызова: с `ctx`, как задача и как starter. Все три остаются. Как их различают, сказано в [Стабильности](stability.md#формы-вызова).

**`all`, `allSettled` и `race` без `ctx` — тоже starters**, поэтому группа вкладывается в другую группу без обёртки. Загрузите две вещи, но сдайтесь через пять секунд:

```js
import { createBus } from "nanoeffects";
import { all, delay, race, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  const result = await race(ctx, {
    // all без ctx — starter: загружает оба, у каждого до 3 попыток
    loaded: all({
      user: retry((_, { signal }) => fetchUser(id, { signal }), { times: 3 }),
      posts: retry((_, { signal }) => fetchPosts(id, { signal }), { times: 3 }),
    }),
    // delay без ctx — когда он побеждает, весь `all` выше отменяется
    waited: delay(5000),
  });

  if ("loaded" in result) {
    render(result.loaded.user, result.loaded.posts);
  }
});
```

Один аргумент — короткая форма, два — форма с `ctx`: `all(effects)` возвращает starter, `all(ctx, effects)` запускает группу. Внутренняя группа останавливается вместе с внешней и отменяет свои starters. `all(ctx)` с одним контекстом — ошибка: сразу выбрасывается `TypeError`. Starter-группе, записанному прямо в группе, тип не нужен. Starter в переменной вне группы не знает свою шину: в TypeScript аннотируйте его `StarterOf<Events>`, а если нужен результат — `StarterOf<Events, Result>`.

**Ограничьте число одновременных запусков.** `all` и `allSettled` запускают все starters сразу, и на длинном списке это шквал запросов. Передайте `{ concurrency }` третьим аргументом: одновременно работает не больше заданного числа, следующий стартует, когда один из выполняющихся завершится:

```js
import { createBus } from "nanoeffects";
import { all, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("sync", async (ids, ctx) => {
  // all с concurrency — по 5 загрузок за раз, результаты в порядке ids
  const users = await all(
    ctx,
    ids.map((id) => retry(() => loadUser(id), { times: 2 })),
    { concurrency: 5 },
  );

  render(users);
});
```

Порядок и форма результата те же, что и без параметра. Если один starter `all` упадёт, выполняющиеся отменяются, а ожидающие не запускаются. `allSettled` продолжает после ошибки. Когда `ctx` прерывается, оба останавливаются и больше ничего не запускают. Значение, не являющееся положительным целым (`0`, `-1`, `NaN`, `1.5`), выбрасывает `RangeError` до старта чего-либо. `Infinity` означает «без ограничения». У `race` нет `concurrency`: он завершается на первом результате, и starter, ждущий свободный слот, не запустился бы никогда. Форма без `ctx` параметров не принимает: второй аргумент выглядел бы как форма с `ctx`. Поэтому starter-группа внутри другой группы их не принимает. Там пишите `(child) => all(child, effects, { concurrency: 5 })`.

**Starter получает контекст собственной дочерней задачи.** Передавайте `child` первым аргументом любому эффекту, как обработчик передаёт `ctx`: когда гонка заканчивается, `child` прерывается и останавливает именно этот эффект. Внешний `ctx` нужен только самому `race`. Если ваш API принимает сигнал в параметрах, передайте туда `child`, у него есть `signal`: `(child) => fetchUser(id, child)` (`fetch` читает из параметров только `signal`). То же верно для `all`, `allSettled` и `timeout`.

Если `ctx` — это `{}` или голый `{ signal }` (вне задачи), у `child` есть только `signal` и `abort`, так что он подходит для `delay` и `poll`, но не для `take`, которому нужна шина.

## Передайте `ctx` вне задачи

Эффекты, которые ждут внутри тела, принимают `ctx` первым: `delay`, `all`, `allSettled`, `race`, `cancellable`, `onAbort`, `take` и формы `retry` / `timeout` / `poll` с `ctx`. Вне задачи передайте `{}` или любой объект с `signal`. Единственное исключение — `delay(ms)` и `take(event)` как starters группы, которым `ctx` не нужен (см. выше).

Для `fetch` и других API, которые принимают сигнал, передавайте `ctx.signal`. Таймаут без `race`: `AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)])`.
