# Выберите плагины шины

> **Уровень F.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1 и 2.

Необязательно. Плагин добавляет к шине одну вещь: поля на `ctx`, метод, реестр обработчиков, диагностику. Читайте эту страницу, когда хотите узнать, какие плагины существуют, что даёт каждый и в каком порядке их подключать. Для небольшой шины пропустите: хватает одного `createBus()`.

## На этой странице

- [Подключите плагин](#подключите-плагин)
- [Выберите плагин по задаче](#выберите-плагин-по-задаче)
- [Основные плагины](#основные-плагины)
  - [Положите стор или клиент на каждый обработчик: `contextPlugin`](#положите-стор-или-клиент-на-каждый-обработчик-contextplugin)
  - [Используйте `race` и `delay` без `ctx`: `effectsPlugin`](#используйте-race-и-delay-без-ctx-effectsplugin)
  - [Привяжите или замените обработчик: `actionsPlugin`](#привяжите-или-замените-обработчик-actionsplugin)
  - [Подключите домен как единое целое: `modulePlugin`](#подключите-домен-как-единое-целое-moduleplugin)
- [Дополнительные плагины](#дополнительные-плагины)
  - [Дайте одному действию собственные поля: `scopePlugin`](#дайте-одному-действию-собственные-поля-scopeplugin)
  - [Привяжите emit или слушателя к внешнему сигналу: `signalPlugin`](#привяжите-emit-или-слушателя-к-внешнему-сигналу-signalplugin)
  - [Назовите источник и поток трассировки: `tracePlugin`](#назовите-источник-и-поток-трассировки-traceplugin)
  - [Слушайте группу событий: `matchPlugin`](#слушайте-группу-событий-matchplugin)
  - [Передайте шину менеджеру состояния: `emitterPlugin`](#передайте-шину-менеджеру-состояния-emitterplugin)
  - [Сообщайте шине об изменении значения в React: `reactPlugin`](#сообщайте-шине-об-изменении-значения-в-react-reactplugin)
  - [Ищите утечки при разработке: `devPlugin`](#ищите-утечки-при-разработке-devplugin)
- [Соберите их вместе](#соберите-их-вместе)
- [Подключайте их в любом порядке](#подключайте-их-в-любом-порядке)
- [Что не является плагином](#что-не-является-плагином)
- [Напишите свой плагин](#напишите-свой-плагин)

## Подключите плагин

Плагин — это функция шины. `bus.use(plugin)` вызывает её с шиной и возвращает то, что вернул плагин. Большинство плагинов возвращают ту же шину, так что их можно сцеплять: `createBus().use(a).use(b)`. Некоторые возвращают что-то своё (реестр, приложение, функцию `disconnect`): сохраните это.

В TypeScript сохраняйте результат `contextPlugin` и `effectsPlugin`: тип шины с новыми полями — это тип, который они возвращают (`const bus = createBus().use(contextPlugin({ store }))`).

## Выберите плагин по задаче

Найдите свою потребность в левом столбце. Подходящей строки нет — плагин не нужен.

| Мне нужно | Использовать |
| --------- | ------------ |
| Стор, клиент или логгер на каждом обработчике | [`contextPlugin`](#положите-стор-или-клиент-на-каждый-обработчик-contextplugin) |
| `race`, `all` или `delay` без передачи `ctx` | [`effectsPlugin`](#используйте-race-и-delay-без-ctx-effectsplugin) |
| Тест, который заменяет обработчик | [`actionsPlugin`](#привяжите-или-замените-обработчик-actionsplugin) |
| Один домен, подключаемый и отключаемый как единое целое | [`modulePlugin`](#подключите-домен-как-единое-целое-moduleplugin) |
| Поля только для одного действия или модуля | [`scopePlugin`](#дайте-одному-действию-собственные-поля-scopeplugin) |
| Задачи, которые останавливаются, когда отменён запрос, сокет или query | [`signalPlugin`](#привяжите-emit-или-слушателя-к-внешнему-сигналу-signalplugin) |
| Один слушатель на группу событий | [`matchPlugin`](#слушайте-группу-событий-matchplugin) |
| Колбэк для менеджера состояния, который отправляет события | [`emitterPlugin`](#передайте-шину-менеджеру-состояния-emitterplugin) |
| Компонент React, который отправляет своё значение на шину | [`reactPlugin`](#сообщайте-шине-об-изменении-значения-в-react-reactplugin) |
| Имена в трассировке | [`tracePlugin`](#назовите-источник-и-поток-трассировки-traceplugin) |
| Предупреждения об утечках при разработке | [`devPlugin`](#ищите-утечки-при-разработке-devplugin) |

## Основные плагины

Эти четыре покрывают то, что нужно большинству приложений: общие зависимости, эффекты, обработчики и модули. Начните с них.

| Плагин | Что даёт | Импорт | Что возвращает `bus.use` |
| ------ | -------- | ------ | ------------------------ |
| [`contextPlugin`](#положите-стор-или-клиент-на-каждый-обработчик-contextplugin) | Ваши собственные поля (стор, клиент, логгер) на `ctx` каждого обработчика. | `nanoeffects` | Ту же шину, типизированную полями |
| [`effectsPlugin`](#используйте-race-и-delay-без-ctx-effectsplugin) | `race`, `all`, `delay` и ваши собственные эффекты на `ctx`, вызываемые без передачи `ctx`. | `nanoeffects/effects` | Ту же шину, типизированную эффектами |
| [`actionsPlugin`](#привяжите-или-замените-обработчик-actionsplugin) | Обработчики действий в реестре, чтобы тест мог привязать или заменить один. | `nanoeffects/actions` | Реестр `{ run, handle }` |
| [`modulePlugin`](#подключите-домен-как-единое-целое-moduleplugin) | Модуль: слушатели, обработчики и задачи одного домена, подключаемые и отключаемые одним вызовом. | `nanoeffects/actions` | Приложение `{ mount, unmount, isMounted, dispose, actions, createModule }` |

### Положите стор или клиент на каждый обработчик: `contextPlugin`

Каждая задача получает на `ctx` одни и те же поля: стор, API-клиент, логгер. Типы берутся из значений. Подробнее в [Полях контекста](context.md).

```js
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";

// contextPlugin — каждый обработчик получает ctx.store
const bus = createBus().use(contextPlugin({ store }));

bus.on("save", (draft, { store }) => store.put(draft));
```

Клиент, который должен останавливаться вместе с задачей, например экземпляр `axios`, передаётся как `fromSignal((signal) => axios.create({ signal }))` из `nanoeffects/signal`: он строится из сигнала каждой задачи, когда задача его читает. Подробнее в [Постройте поле из сигнала каждой задачи](context.md#постройте-поле-из-сигнала-каждой-задачи).

### Используйте `race` и `delay` без `ctx`: `effectsPlugin`

Эффекты вроде `race`, `all`, `take` и `delay` привязаны к задаче, так что обработчик вызывает `race({ … })`, а не `race(ctx, { … })`. Ваши собственные функции, принимающие `{ signal }` первым, тоже работают. Подробнее в [Эффектах](effects.md#положите-выбранные-эффекты-на-ctx).

```js
import { createBus } from "nanoeffects";
import { delay, effectsPlugin, race } from "nanoeffects/effects";

// effectsPlugin — race и delay привязаны к задаче каждого обработчика
const effects = effectsPlugin({ race, delay });

const bus = createBus().use(effects);

bus.on("load", async (id, { race, delay }) => {
  const result = await race({
    data: (child) => api.get(id, child),
    timeout: () => delay(5000),
  });
});
```

### Привяжите или замените обработчик: `actionsPlugin`

Обработчики действий могут жить в реестре, принадлежащем шине. У действия может не быть обработчика, а тест или другой слой привязывает его. Подробнее в [Действиях](actions.md#привяжите-обработчик-позже).

```js
import { createBus } from "nanoeffects";
import { actionsPlugin, createAction } from "nanoeffects/actions";

const getUser = createAction("user/get"); // обработчика пока нет: событие
const bus = createBus();

// actionsPlugin — реестр обработчиков этой шины
const actions = bus.use(actionsPlugin());

actions.handle(getUser, async (id) => ({ id })); // побеждает последняя привязка
const user = await bus.emit(getUser("1")); // { id: "1" }
```

### Подключите домен как единое целое: `modulePlugin`

Модуль группирует слушателей, привязанные обработчики и фоновые задачи одного домена и завершает все их, когда отключается. Он же делает рабочей [горячую перезагрузку](hmr.md). Подробнее в [Модулях](actions.md#подключайте-домены-модулями).

```js
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";

const bus = createBus();

// modulePlugin — подключает userModule в конце этого блока или при первом использовании, если оно раньше, и возвращает приложение
const app = bus.use(modulePlugin([userModule]));

app.unmount(userModule); // его слушатели, привязанные действия и задачи исчезли
```

## Дополнительные плагины

Добавляйте один из них, когда встретите его потребность. Ни один не обязателен.

| Плагин | Что даёт | Импорт | Что возвращает `bus.use` |
| ------ | -------- | ------ | ------------------------ |
| [`scopePlugin`](#дайте-одному-действию-собственные-поля-scopeplugin) | Собственные поля для одного действия, задачи или модуля и способ заменить их в одном `emit`. | `nanoeffects/scope` | Ту же шину |
| [`signalPlugin`](#привяжите-emit-или-слушателя-к-внешнему-сигналу-signalplugin) | `emit(call, { signal })`, который прерывает свои задачи, и `on(event, handler, { signal })`, который снимает слушателя, когда внешний сигнал прерывается. | `nanoeffects/signal` | Ту же шину, типизированную новым `emit` |
| [`matchPlugin`](#слушайте-группу-событий-matchplugin) | `on`, который слушает группу событий, выбираемую функцией. | `nanoeffects/match` | Ту же шину, типизированную новыми перегрузками |
| [`emitterPlugin`](#передайте-шину-менеджеру-состояния-emitterplugin) | Колбэк, который отправляет действие, чтобы отдать его менеджеру состояния. | `nanoeffects/actions` | Ту же шину с `emitter` |
| [`tracePlugin`](#назовите-источник-и-поток-трассировки-traceplugin) | `traceId` и `traceGroupId` для трассировки: корень эмиттера, поток, именованный слушатель. | `nanoeffects/trace` | Ту же шину |
| [`reactPlugin`](#сообщайте-шине-об-изменении-значения-в-react-reactplugin) | Хук React, который отправляет событие, когда меняется значение компонента. | `nanoeffects/react` | Ту же шину с `useEmitter` |
| [`devPlugin`](#ищите-утечки-при-разработке-devplugin) | Предупреждения о накапливающихся слушателях и сообщения о модулях при разработке. | `nanoeffects/dev` | Функцию, которая его отключает |

### Дайте одному действию собственные поля: `scopePlugin`

Действие с обработчиком, действие, задача или модуль могут нести свои поля и эффекты, а один `emit` может их заменить. Тест даёт подделку одному вызову. Подробнее в [Областях (scope)](scope.md).

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { scopePlugin } from "nanoeffects/scope";

// scopePlugin — включает scope действия на этой шине
const bus = createBus().use(scopePlugin());

// последний аргумент: поля только этого действия
const getUser = createAction("user/get", (id, { api }) => api.getUser(id), {
  api,
});

const fakeApi = { getUser: async (id) => ({ id, name: "test" }) };
bus.emit(getUser("1"), { api: fakeApi }); // поддельный api только для этого вызова
```

### Привяжите emit или слушателя к внешнему сигналу: `signalPlugin`

Библиотека вроде React Query владеет запросом и даёт вам `AbortSignal`. `emit` принимает его как `{ signal }` и прерывает запущенные им задачи, когда сигнал прерывается, так что `timeout`, `retry` и сам запрос тоже останавливаются. Подробнее в [nanoeffects с React Query, SWR и RTK Query](query-libraries.md).

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { signalPlugin } from "nanoeffects/signal";

// signalPlugin — emit принимает { signal } для действия или задачи
const bus = createBus().use(signalPlugin());

const getUser = createAction("user/get", (id, { signal }) => api.getUser(id, { signal }));

const controller = new AbortController();
bus.emit(getUser("1"), { signal: controller.signal }); // запускает действие
controller.abort(); // ctx.signal обработчика прерывается вместе с ним
```

Тот же сигнал может завершить и слушателя. `on` и `once` принимают `{ signal }` в параметрах, как `addEventListener`, так что коду, у которого есть сигнал, не нужна функция `unbind`. Слушатель снимается, когда сигнал прерывается; уже выполняющийся обработчик не прерывается. Уже прерванный сигнал не добавляет слушателя.

```js
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// signalPlugin — on и once принимают { signal } в параметрах
const bus = createBus().use(signalPlugin());

const controller = new AbortController();
bus.on("saved", (draft) => console.log(draft), { signal: controller.signal }); // слушает до прерывания
controller.abort(); // слушатель исчез: bus.get("saved") пуст
```

Без плагина параметр `signal` игнорируется, и слушатель остаётся. `off(event, handler)` снимает слушателя, но не обрывает его связь с сигналом; для этого вызовите функцию, которую вернул `on`.

### Назовите источник и поток трассировки: `tracePlugin`

Когда на шине есть трассировщик, плагин позволяет трассировке сказать, какая подписка начала цепочку (`traceId` у `useEmitter` и `bus.emitter`), проследить один поток по `traceGroupId` и показать, какой слушатель выполнился (`bus.on(event, handler, { traceId })`). Без плагина параметры игнорируются. Подробнее в [Трассировке](tracing.md#покажите-какая-подписка-начала-цепочку).

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: отправляет каждое событие трассировки логгеру; consoleLogger: печатает по одной строке на каждое
const trace = createTracer(consoleLogger());

// tracePlugin — называет корни, группы и слушателей трассировки
const bus = createBus({ trace })
  .use(tracePlugin());

bus.on("name/changed", saveName, { traceId: "saveNotifier" }); // слушатель, которого можно найти в логе
```

### Слушайте группу событий: `matchPlugin`

`on`, `once` и `off` принимают функцию, выбирающую события, например каждое событие `user/*`. Охранник типа сужает нагрузку. Подписка слушает каждое событие, поэтому для нескольких известных событий дешевле `on(creator, handler)`. Подробнее в [Руководстве](guide.md#выбирайте-события-функцией).

```js
import { createBus } from "nanoeffects";
import { matchPlugin } from "nanoeffects/match";

// matchPlugin — on принимает функцию, которая выбирает события
const bus = createBus().use(matchPlugin());

bus.on(
  (action) => action.type.startsWith("user/"),
  (payload, ctx) => console.log(ctx.type, payload),
);
```

### Передайте шину менеджеру состояния: `emitterPlugin`

`bus.emitter(creator)` — колбэк, отправляющий действие. Менеджер состояния принимает его как колбэк подписки, так что изменение стора становится событием. Подробнее в [Сторах](stores.md#отправляйте-события-из-менеджера-состояния).

```js
import { atom } from "nanostores";
import { createBus } from "nanoeffects";
import { createAction, emitterPlugin } from "nanoeffects/actions";

// emitterPlugin — добавляет bus.emitter
const bus = createBus().use(emitterPlugin());
const nameChanged = createAction("name/changed");
const $name = atom("");

$name.listen(bus.emitter(nameChanged)); // каждое изменение $name отправляет nameChanged
```

### Сообщайте шине об изменении значения в React: `reactPlugin`

`useEmitter(event, value, options?)` отправляет событие после коммита рендера с новым значением. Он не отправляет при монтировании и не отправляет дважды под StrictMode. Параметры — `{ equals, traceId, traceGroupId }`; последние два называют эту отправку в [трассировке](tracing.md#покажите-какая-подписка-начала-цепочку). Нужен React 18 или новее. Подробнее в [Сторах](stores.md#react-одно-значение-на-несколько-компонентов).

```jsx
import { useState } from "react";
import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

// reactPlugin — добавляет bus.useEmitter; деструктуризация даёт свободный хук
const bus = createBus().use(reactPlugin());
const { useEmitter } = bus;

function Profile() {
  const [name, setName] = useState("");
  useEmitter("name/changed", name); // отправляет после рендера с новым именем
  return <input value={name} onChange={(event) => setName(event.target.value)} />;
}
```

### Ищите утечки при разработке: `devPlugin`

Он предупреждает о слушателях, которые были добавлены и ни разу не отписаны, и сообщает о модулях, которые подключаются, заменяются и отключаются. В production-сборке `nanoeffects/dev` пуст, так что вызов можно оставить. Подробнее в [Горячей перезагрузке](hmr.md#сообщайте-об-утечках-через-devplugin).

```js
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { devPlugin } from "nanoeffects/dev";

const bus = createBus();
bus.use(modulePlugin([userModule]));

// devPlugin — предупреждения и сообщения в консоли при разработке;
// он находит приложение modulePlugin на шине, какой бы из двух вы ни подключили первым
const disconnect = bus.use(devPlugin());

disconnect(); // останавливает диагностику
```

## Соберите их вместе

Одна шина со всеми плагинами, которым не нужен React, в отдельном файле. События приложения остаются в других файлах. Плагины работают в любом порядке; в следующем разделе сказано, что это значит для модулей.

```js
// bus.js
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";
import {
  actionsPlugin,
  emitterPlugin,
  modulePlugin,
} from "nanoeffects/actions";
import { devPlugin } from "nanoeffects/dev";
import { all, effectsPlugin, race } from "nanoeffects/effects";
import { matchPlugin } from "nanoeffects/match";
import { scopePlugin } from "nanoeffects/scope";

export const bus = createBus()
  .use(contextPlugin({ store })) // ctx.store на каждой задаче
  .use(effectsPlugin({ race, all })) // ctx.race и ctx.all, привязанные к задаче
  .use(scopePlugin()) // scope для действий, задач, модулей и emit
  .use(matchPlugin()) // bus.on принимает функцию, которая выбирает события
  .use(emitterPlugin()); // bus.emitter(creator)

// actionsPlugin — реестр обработчиков действий; сохраните его, чтобы привязывать обработчики позже
export const actions = bus.use(actionsPlugin());

// modulePlugin — подключает userModule в конце этого блока; сохраните app, чтобы подключать и отключать позже
export const app = bus.use(modulePlugin([userModule]));

// devPlugin — сообщает об утечках и модулях при разработке; сохраните disconnect, чтобы его убрать
export const disconnect = bus.use(devPlugin());
```

## Подключайте их в любом порядке

Плагины дают один и тот же результат в любом порядке. Подключайте их так, как лучше читается, а приложение `modulePlugin` ставьте туда, где вы его храните.

Из-за позднего подключения модулей происходят две вещи:

- **Модули стартуют в конце блока.** `modulePlugin([userModule])` подключает `userModule`, когда синхронный блок, создавший его, закончился, или раньше, если сначала использовались приложение или шина: первый `bus.emit` либо первый вызов `app.mount`, `app.unmount`, `app.isMounted`, `app.dispose` или чтение `app.actions`. К этому моменту каждый плагин, подключённый в том же блоке, уже на шине, так что у модуля и задач, которые он порождает, есть поля, эффекты и scope плагинов, подключённых после `modulePlugin`, а `m.on(fn, handler)` работает с `matchPlugin`. Плагин, подключённый после `await`, может опоздать: подключайте каждый плагин до первого `await`. Без модулей `modulePlugin()` ничего не запускает до первого использования.
- **Слушатели сохраняют своё место.** `bus.on` после `bus.use(modulePlugin(...))` удерживается, пока модули не подключены, а затем выполняется в том порядке, в котором вы его написали. Поэтому слушатели модуля остаются впереди зарегистрированных после плагина и позади зарегистрированных до него. Функция, которую возвращает `bus.on`, работает и до, и после.

Остальным плагинам порядок не нужен по другой причине:

- `actionsPlugin` привязывает свой список в реестре, который есть у шины, так что он может идти до или после `modulePlugin`. Собственный `bus.actions = { run }` заменяется.
- `effectsPlugin` и `contextPlugin` не заменяют поле, которое уже есть на `ctx`, так что scope побеждает в любом порядке.
- `devPlugin()` находит приложение, которое `modulePlugin` положил на шину (`bus.app`). `devPlugin({ app })` по-прежнему работает.
- `matchPlugin` и `devPlugin` оба оборачивают `bus.on`; `devPlugin` считает функцию, выбирающую события, под `"*"`, а его `disconnect` оставляет обёртку, которая была положена поверх него.

Имя, которое уже является полем контекста шины, — ошибка типов, когда `contextPlugin` или `effectsPlugin` добавляет его снова.

Тест кладёт каждый плагин на шину во многих порядках и проверяет, что делает каждый (`src/tests/plugin-matrix.test.ts`). Порядок, который что-то ломает, — это баг.

## Что не является плагином

Эти вещи соединяют шину с чем-то, но через `bus.use` не используются:

- `createEffectsMiddleware(bus, { filter })` из `nanoeffects/redux` — middleware Redux для существующей шины. См. [Сторы](stores.md#подключите-redux-toolkit-к-шине).
- `createBus({ trace })` принимает трассировщик из `nanoeffects/trace`. См. [Трассировку](tracing.md).
- `extendBus(bus, Base)` из `nanoeffects/oop` даёт классу методы шины, а подписки каждого экземпляра заканчиваются через `dispose()`. Он читает шину как есть, так что сначала подключите плагины. См. [Шина в классе](oop.md).
- `createObserve(bus)` из `nanoeffects/observable` превращает событие в Observable, а `events(bus, event)` — в цикл `for await`. См. [Observable](observable.md).

## Напишите свой плагин

Плагин — это функция шины, которая возвращает то, что вам нужно. Шина не хранит списка плагинов, поэтому подключённый плагин шина убрать не может; плагин возвращает собственный `stop` или `disconnect`, если он нужен.

```js
// count-plugin.js
// ваш собственный плагин: функция шины, которая возвращает то, что вам нужно
export const countPlugin = (bus) => {
  let count = 0;
  const unbind = bus.on("*", () => {
    count += 1;
  });
  return { count: () => count, stop: unbind };
};
```

```js
import { createBus } from "nanoeffects";
import { countPlugin } from "./count-plugin";

const bus = createBus();
// use — вызывает countPlugin(bus) и возвращает его результат
const counter = bus.use(countPlugin);

bus.emit("greet", "Ada");
console.log(counter.count()); // 1
counter.stop();
```
