# Эффекты и отмена

> **[Уровень C](README.md#виды-проектов)**: сложная бизнес-логика. Сначала прочитайте: [Политики](policies.md).

Страница нужна для повторов, таймаутов, ожидания и параллельной работы, а не как первая страница для небольшой шины. Выберите **один** эффект под свою задачу, остальное — справочник.

Прерывание лишь поднимает флаг: остановиться должен ваш код. Начните с `retry` и `timeout` на обработчике (см. [Руководство, шаг 5](guide.md#5-retry-и-timeout)).

## Эффекты

У каждого эффекта ниже свой раздел с формами вызова, параметрами и примером. `ctx` — контекст задачи.

- [`retry`](#retry) — повторить вызов после ошибки.
- [`timeout`](#timeout) — остановить вызов, который длится слишком долго.
- [`poll`](#poll) — вызывать функцию с интервалом.
- [`backoff`](#backoff) — сделать паузу между повторами растущей.
- [`delay`](#delay) — подождать некоторое время; прерывание заканчивает ожидание.
- [`cancellable`](#cancellable) — Promise, привязанный к сигналу задачи, для callback и таймеров.
- [`onAbort`](#onabort) — выполнить код при прерывании задачи.
- [`ctx.on` и `ctx.off`](#ctxon-и-ctxoff) — подписка на шину внутри задачи.
- [`take`](#take) — дождаться следующего события внутри обработчика.
- [`all`](#all) — запустить несколько вызовов вместе; одна ошибка отменяет остальные.
- [`allSettled`](#allsettled) — дождаться всех, чем бы они ни закончились.
- [`race`](#race) — взять первый результат и отменить остальные.
- [`effectsPlugin`](#effectsplugin) — короткая форма эффектов: вызов без `ctx`.
- [Эффекты вне задачи](#эффекты-вне-задачи) — вызов эффектов там, где нет обработчика.

## `retry`

Запускает функцию снова после ошибки. Нужен, когда вызов время от времени падает, например из-за сети.

Формы вызова:

- `retry(fn, options?)` — обёртка обработчика: принимает функцию `(payload, ctx) => result` и возвращает такую же. Передаётся в `on` рядом с политиками.
- `retry(ctx, fn, options?)` — вызов внутри тела обработчика.

Параметры:

- `times` — всего попыток. По умолчанию `3`.
- `delay` — число или функция `(attempt, error) => ms`. Растущая пауза: [`backoff`](#backoff).
- `shouldRetry(error, attempt)` — верните `false`, чтобы остановиться раньше.
- `fn` получает номер попытки, начиная с `1`.
- При прерывании `retry` отклоняется с причиной прерывания.

```js
import { createBus } from "nanoeffects";
import { retry } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();
const loadUser = (id, { signal }) => fetchUser(id, { signal });

// retry — обёртка обработчика: до 4 попыток, но не после фатальной ошибки
const loadWithRetry = retry(loadUser, {
  times: 4,
  shouldRetry: (error) => !isFatal(error),
});

// latest — новая загрузка прерывает старую цепочку попыток
bus.on("load", latest(loadWithRetry));

// ctx.run — запустить обёрнутую функцию как дочернюю задачу (прерывается вместе с обработчиком)
bus.on("open", async (id, ctx) => {
  const user = await ctx.run(loadWithRetry, id);
  ctx.emit("opened", user);
});
```

Обёртку берите для всего обработчика или всего `ctx.run`. Каждая попытка получает свой дочерний контекст: прерывание вызывающего до него доходит, а прерывание одной попытки до вызывающего не доходит. Для одного вызова в середине тела берите форму с `ctx`:

```js
import { createBus } from "nanoeffects";
import { retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("load", async (id, ctx) => {
  // retry с ctx — один вызов внутри тела обработчика
  const user = await retry(
    ctx,
    () => fetchUser(id, { signal: ctx.signal }),
    { times: 4 },
  );

  ctx.emit("loaded", user);
});
```

## `timeout`

Отклоняется, если работа длится дольше заданного времени, и прерывает её. Нужен, когда запрос может зависнуть.

Формы вызова:

- `timeout(ms, handler)` — обёртка обработчика.
- `timeout(ctx, ms, fn)` — вызов внутри тела; `fn` получает контекст своей дочерней задачи.

Ошибка — `DOMException` с именем `TimeoutError` (как у `AbortSignal.timeout`). `timeout` отклоняется, даже если функция игнорирует свой сигнал.

```js
import { createBus } from "nanoeffects";
import { timeout } from "nanoeffects/effects";

const bus = createBus();
const loadUser = (id, { signal }) => fetchUser(id, { signal });

// timeout — обёртка обработчика: он должен уложиться в 5 с
bus.on("load", timeout(5000, loadUser));

bus.on("open", async (id, ctx) => {
  // timeout с ctx — один вызов внутри тела; child несёт сигнал запроса
  const data = await timeout(ctx, 5000, (child) => fetchData(id, child));
  ctx.emit("opened", data);
});
```

## `poll`

Вызывает функцию снова и снова с интервалом, пока задача не прервана. Нужен, чтобы обновлять данные каждые N секунд. Работает как `interval` в patronum.

Формы вызова:

- `poll(ms, fn, options?)` — обёртка обработчика.
- `poll(ctx, fn, ms)` — вызов внутри тела.

Параметры:

- Первый вызов происходит через `ms`. `leading: true` вызывает ещё и сразу.
- Следующие тики держат ровный темп независимо от длительности `fn`, поэтому медленный `fn` может пересечься со следующим вызовом. `waitForFn: true` начинает каждую паузу, когда вызов закончился, и вызовы никогда не пересекаются.
- `fn` получает номер вызова, начиная с `0`.
- Ошибка из `fn` останавливает опрос и отклоняет Promise. Прерывание завершает его нормально и очищает таймер.

```js
import { createBus } from "nanoeffects";
import { poll } from "nanoeffects/effects";

const bus = createBus();

// poll — обёртка обработчика: вызывать refresh каждые 10 с, пока задача не прервана
bus.on("watch", poll(10_000, (_, { signal }) => refresh({ signal })));

bus.on("sync", async (_, ctx) => {
  // poll с ctx — то же внутри тела обработчика
  await poll(ctx, () => refresh(), 10_000);
});
```

`retry`, `timeout` и `poll` попадают в трассировку: эффект — это группа, а каждая попытка или вызов — дочерний `run`.

## `backoff`

Делает паузу между повторами растущей, с ограничением и джиттером. Нужен, когда backend или сеть падают под нагрузкой: повтор сразу или с фиксированной паузой возвращает всех клиентов в один момент и не даёт backend подняться. `backoff(options)` возвращает функцию `(attempt) => ms`.

Самая короткая форма — функция `delay`. Импорт ей не нужен:

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

Пауза может быть функцией везде, где задаётся время:

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

## `delay`

Ждёт заданное время и отклоняется при прерывании. Обычный `setTimeout` продолжил бы работу после прерывания задачи, а `delay` сразу заканчивает ожидание и очищает таймер. `delay(ctx, ms)`, где `ms` может быть функцией.

```js
import { createBus } from "nanoeffects";
import { delay } from "nanoeffects/effects";

const bus = createBus();

bus.on("saved", async (_, ctx) => {
  // delay — ждать 3 с; прерывание сразу заканчивает ожидание и очищает таймер
  await delay(ctx, 3000);
  ctx.emit("toast/hidden");
});
```

## `cancellable`

Promise, привязанный к сигналу задачи. Нужен для API на callback, таймерах и обработчиках событий: сигнал сам их не остановит, поэтому `cancellable` при прерывании отклоняет Promise и выполняет вашу очистку. `cancellable(ctx, executor)` работает как `new Promise`, но executor получает `{ resolve, reject, onCancel }`.

```js
import { createBus } from "nanoeffects";
import { cancellable } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// cancellable — Promise, привязанный к сигналу задачи; onCancel регистрирует очистку
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

- Если задача прервётся до завершения Promise, очистки выполнятся (последняя зарегистрированная первой), а Promise отклонится с причиной прерывания.
- Если задача уже прервана, executor не запускается.
- После завершения Promise подписка на прерывание снимается, а очистки отбрасываются.

## `onAbort`

Выполняет код при прерывании задачи: это хук жизненного цикла задачи. Задачу могут прервать, потому что пользователь ушёл или её заменил новый вызов, и всё, что она открыла (сокет, таймер, подписку), тогда нужно закрыть. `onAbort(ctx, fn)` запускает `fn(reason)` при прерывании (сразу, если задача уже прервана) и возвращает функцию отписки.

```js
import { createBus } from "nanoeffects";
import { onAbort } from "nanoeffects/effects";

const bus = createBus();

bus.on("connect", (url, ctx) => {
  const socket = new WebSocket(url);
  // onAbort — закрыть сокет, когда эта задача прервана
  onAbort(ctx, () => socket.close());
});
```

## `ctx.on` и `ctx.off`

Подписка на шину внутри задачи. У контекста задачи есть `on` и `off`, как у шины, а подписка, сделанная через `ctx.on`, заканчивается, когда задача прерывается.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

bus.on("watch", (_, ctx) => {
  // пропадает, когда эта задача прервана
  const stop = ctx.on("tick", (n) => console.log(n));

  // или закончить раньше самим: stop() отписывает
  ctx.on("watch/closed", stop);
});
```

Будьте внимательны:

- **Задача, которая закончилась сама, не прерывается**, поэтому её подписка из `ctx.on` остаётся. Когда работа закончена, отпишитесь функцией, которую вернул `ctx.on`, или вызовите `ctx.abort()`.
- Чтобы дождаться **одного** события, берите [`take`](#take): он отписывается сам.
- Для подписок, которые живут столько же, сколько фича, берите [модуль](actions.md#модули): `unmount` снимает их все.

Ещё:

- После прерывания `ctx.on` ничего не делает.
- Под `latest` подписки вытесненного запуска заканчиваются вместе с ним.
- `ctx.off(event)` очищает всех обработчиков события на шине, а не только обработчиков этой задачи.

## `take`

Ждёт следующее событие шины внутри обработчика и завершается с его payload. `take(ctx, event, options?)`. `event` — имя события или action creator, как для `bus.on`.

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { take, timeout } from "nanoeffects/effects";

const bus = createBus();
const stopRequested = createAction("stop"); // событие с именем; его вызов строит action

bus.on("login", async (user, ctx) => {
  const reason = await take(ctx, "logout"); // завершается на следующем logout
  cleanup(user, reason);

  // action creator работает так же, а тип его payload — тип результата
  const stopped = await take(ctx, stopRequested);
  console.log(stopped);

  // ждать подходящее событие, но не дольше 5 с
  const id = await timeout(
    ctx,
    5000,
    take("saved", { predicate: (savedId) => savedId === draft.id }), // take без ctx — готовая функция для группы
  );
});
```

- Видит только события, отправленные после вызова, берёт одно и отписывается.
- С action creator результат имеет тип его payload. Action creator без типа payload (`createAction("saved")`) берёт тип из карты событий шины.
- `options.predicate` пропускает payload, которые он отклоняет. В TypeScript type guard (`(payload): payload is Admin`) сужает тип результата.
- `options.signal` останавливает ожидание. Внутри `race`, `all` или `timeout` он не нужен: группа и так останавливает ожидание, так что пишите `take("saved")` без параметров.
- При прерывании задачи или `options.signal` отписывается и отклоняется с причиной прерывания.

## `all`

Запускает несколько вызовов вместе; одна ошибка отменяет остальные. Нужен, чтобы загрузить несколько вещей сразу. `all(ctx, effects)` принимает объект или массив функций, и результат сохраняет эту форму.

```js
import { createBus } from "nanoeffects";
import { all } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  // all — запустить оба запроса вместе; одна ошибка отменяет другой. child — контекст своего запроса
  const { user, posts } = await all(ctx, {
    user: (child) => fetchUser(id, child),
    posts: (child) => fetchPosts(id, child),
  });

  ctx.emit("opened", { user, posts });
});
```

Каждая функция группы получает `child` — контекст своей дочерней задачи. Передавайте `child` первым аргументом любому эффекту, как обработчик передаёт `ctx`: когда группа заканчивается или падает, `child` прерывается и останавливает именно этот эффект. Если ваш API принимает сигнал в параметрах, передайте туда `child`, у него есть `signal`: `(child) => fetchUser(id, child)` (`fetch` читает из параметров только `signal`). То же верно для `allSettled`, `race` и `timeout`.

**Ограничьте число одновременных запусков.** `all` и `allSettled` запускают всё сразу, и на длинном списке это шквал запросов. Передайте `{ concurrency }` третьим аргументом: одновременно работает не больше заданного числа, следующий стартует, когда один из выполняющихся завершится:

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

Порядок и форма результата те же, что и без параметра. Если один вызов `all` упадёт, выполняющиеся отменяются, а ожидающие не запускаются. `allSettled` продолжает после ошибки. Когда `ctx` прерывается, оба останавливаются и больше ничего не запускают. Значение, не являющееся положительным целым (`0`, `-1`, `NaN`, `1.5`), выбрасывает `RangeError` до старта чего-либо. `Infinity` означает «без ограничения». У `race` нет `concurrency`: он завершается на первом результате, и вызов, ждущий свободный слот, не запустился бы никогда.

## `allSettled`

Ждёт каждый вызов и не падает из-за одного. Нужен, когда частичный ответ лучше, чем никакого. `allSettled(ctx, effects)`. Каждый результат — `{ status: "fulfilled", value }` или `{ status: "rejected", reason }`. Когда вызов падает, ничего не отменяется. Отклонить `allSettled` может только прерывание `ctx`.

```js
import { createBus } from "nanoeffects";
import { allSettled } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  // allSettled — дождаться обоих, чем бы они ни закончились
  const { user, posts } = await allSettled(ctx, {
    user: (child) => fetchUser(id, child),
    posts: (child) => fetchPosts(id, child),
  });

  if (user.status === "fulfilled") {
    render(user.value);
  }
});
```

## `race`

Завершается с первым закончившимся вызовом и отменяет остальные. Нужен, чтобы взять самый быстрый ответ или прервать ожидание. `race(ctx, effects)`.

```js
import { createBus } from "nanoeffects";
import { delay, race, take } from "nanoeffects/effects";

const bus = createBus();

bus.on("save", async (draft, ctx) => {
  // race — побеждает тот, кто закончил первым, другой отменяется
  const result = await race(ctx, {
    waited: delay(1000), // delay без ctx — готовая функция для группы: race передаёт ей свой child
    cancelled: take("cancel"), // take без ctx — то же, ждёт следующий "cancel"
  });

  if ("waited" in result) {
    ctx.emit("saved", draft);
  }
});
```

**`delay` и `take` без `ctx` — готовые функции для группы.** В группе `delay(1000)` и `take("cancel")` равны `(child) => delay(child, 1000)` и `(child) => take(child, "cancel")`: группа вызывает их с child, поэтому ожидание останавливается вместе с группой. Берите эту форму внутри `race`, `all`, `allSettled` и `timeout`, а в обычном коде обработчика пишите `delay(ctx, 1000)`. Они ждут, только когда их вызывает группа: `await delay(1000)` сам по себе не сработает, потому что это функция, а не Promise. В TypeScript такая функция в переменной вне группы не знает событий вашей шины, и их нужно назвать самому: `const cancelled: StarterOf<Events> = take("cancel")` (`StarterOf` экспортирует `nanoeffects/effects`).

Обёртки `retry`, `timeout` и `poll` в группе тоже работают: группа вызывает их с child, а обёрнутая функция получает `undefined` вместо payload и child вместо контекста. Нужные данные передайте через замыкание:

```js
import { createBus } from "nanoeffects";
import { delay, race, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  const result = await race(ctx, {
    // retry без ctx — до 3 попыток, каждая с сигналом child
    user: retry((_, { signal }) => fetchUser(id, { signal }), { times: 3 }),
    // delay без ctx — проигравший отменяется, когда другой заканчивает
    waited: delay(5000),
  });

  if ("user" in result) {
    render(result.user);
  }
});
```

Поэтому у `retry`, `timeout` и `poll` три формы вызова: с `ctx`, как задача (Task) для `bus.on` и `ctx.run` и внутри группы. Формы различаются по аргументам: контекст первым — форма с `ctx`; функция, вызванная с payload и контекстом, — задача; та же функция, вызванная группой с одним аргументом, своим child, — форма для группы. Это не зависит от того, сколько параметров объявляет ваша функция.

**`all`, `allSettled` и `race` без `ctx` тоже работают в группе**, поэтому одна группа вкладывается в другую без обёртки. Загрузите две вещи, но сдайтесь через пять секунд:

```js
import { createBus } from "nanoeffects";
import { all, delay, race, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  const result = await race(ctx, {
    // all без ctx — загружает оба ресурса, у каждого до 3 попыток
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

Один аргумент — короткая форма, два — форма с `ctx`: `all(effects)` возвращает функцию для группы, `all(ctx, effects)` запускает группу. Внутренняя группа останавливается вместе с внешней и отменяет свои вызовы. `all(ctx)` с одним контекстом — ошибка: сразу выбрасывается `TypeError`. Форма без `ctx` параметров не принимает: второй аргумент выглядел бы как форма с `ctx`. Там пишите `(child) => all(child, effects, { concurrency: 5 })`. В TypeScript группе, которая лежит в переменной вне группы, нужен тип: `StarterOf<Events>`, а если нужен результат — `StarterOf<Events, Result>`.

## `effectsPlugin`

Короткая форма эффектов: `effectsPlugin(effects)` кладёт выбранные эффекты на `ctx`, и обработчик вызывает их, не передавая `ctx` везде. Нужен, когда многие обработчики вызывают одни и те же помощники, чтобы убрать лишний код. Обработчик достаёт их деструктуризацией, как `signal`. В бандл попадают только переданные эффекты ([точки входа пакета](package.md)).

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
    data: (child) => fetchData(id, child),
    // функция группы получает свой child с теми же привязанными эффектами, поэтому delay(5000) останавливается вместе с гонкой
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
- Ваша собственная функция тоже подходит, если её первый параметр — `{ signal }` (*эффект*): `effectsPlugin({ fetchJson })` даст `ctx.fetchJson(url)`. TypeScript убирает первый параметр из её типа; для обобщённой функции см. [Сохранение обобщённого эффекта обобщённым](context.md#обобщённый-эффект).
- Не добавляйте `retry`, `timeout` и `poll`: привязанные к задаче, они путались бы со своими обёртками обработчика.
- Поля из `createBus({ context })` остаются. TypeScript отклоняет эффект, чьё имя уже занято полем контекста шины, в том числе добавленным более ранним `effectsPlugin`.
- Свободные формы продолжают работать: `race(ctx, …)`.

## Эффекты вне задачи

Эффекты принимают `ctx` первым. В обработчике это `ctx`, который у вас уже есть. Вне задачи (в обычной функции, скрипте или тесте) `ctx` нет: передайте объект с `signal`, а если прерывать не собираетесь — `{}`.

```js
import { delay, retry } from "nanoeffects/effects";

const controller = new AbortController();

// вне задачи ctx нет: достаточно объекта с signal
const context = { signal: controller.signal };

// эффекты принимают его как ctx; fetchUser получает тот же signal, поэтому останавливается и сам запрос
const user = await retry(
  context,
  () => fetchUser("1", { signal: controller.signal }),
  { times: 3 },
);

await delay(context, 500);

// останавливает ожидающие повторы и паузы
controller.abort();
```
