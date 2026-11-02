# Actions, jobs и модули

> **[Уровень D](README.md#виды-проектов)**: доменная логика вне UI. Сначала прочитайте: [Руководство](guide.md#1-создание-шины-событий).

Когда в проекте становится много бизнес-логики, её нужно разделить. Один из способов — разделить по доменам, или сущностям. Например, в магазине доменами могут быть товары и категории товаров. Тогда код с actions одного домена лежит в одном файле (`product.js`), его обработчики — в другом, а модуль, который их подключает, — в третьем. Домен можно подключить, заменить или отключить, не трогая остальные. Для магазина файлы могли бы выглядеть так:

```text
src/
  bus.js
  product/
    product.js
    product-handlers.js
    product-module.js
  category/
    category.js
    category-handlers.js
    category-module.js
```

Содержимое таких файлов показывают примеры ниже.

Если вам нужны только `on` и `emit` или политики, оставайтесь в [Руководстве](guide.md): сюда стоит идти, когда нужен результат `emit` или подключаемый домен.

Рецепт без UI-фреймворка: [`examples/modules.ts`](../../examples/modules.ts).

Чат с двумя сущностями и тремя фичами, jobs под политиками и эффектами и поток, привязанный к модулю: [Чат с сущностями, фичами, модулями и небольшим backend](chat-example.md).

Целый проект с двумя доменами, job и React как тонким слоем: `npm create nanoeffects@latest my-app -- --template domains-ts` (см. [Проект из шаблона](starter.md#начало-с-доменами)).

## Action, job и модуль

Четыре формы, у каждой одна идея. Берите первую подходящую строку.

| Форма | Что это | Когда использовать |
| ----- | ------- | ------------------ |
| `createAction(type)` | Action без обработчика: имя и payload. | UI или обработчик сообщает, что что-то произошло. |
| `createAction(type, handler)` | Action с обработчиком: `emit` запускает обработчик и возвращает его результат. | Нужно получить результат обработчика из `emit`. |
| `createJob(type, handler)` | Action с обработчиком, результат которого приходит как actions `success` и `fail`; кроме них job отправляет `pending` и `cancel`. | Нужно получить результат работы обработчика и, если понадобится, подписаться на state этой работы. |
| `createModule(name, setup)` | Группа actions и jobs с их обработчиками, которая подключается и отключается одним вызовом. | Один домен должен запускаться и останавливаться как единое целое. |

Начинайте с actions. Добавьте обработчик, когда нужен результат, job — когда нужен статус, модуль — когда нужно единое целое.

## На этой странице

- [Action, job и модуль](#action-job-и-модуль)
- [Получение результата `emit`](#получение-результата-emit)
- [Actions, handlers и jobs](#actions-handlers-и-jobs)
  - [Actions](#actions)
  - [Привязка обработчика позже](#привязка-обработчика-позже)
  - [Тип результата привязанного обработчика](#тип-результата-привязанного-обработчика)
  - [Jobs](#jobs)
- [State работы job](#state-работы-job)
- [Модули](#модули)
- [Расширение контекста actions и модулей](#расширение-контекста-actions-и-модулей)

## Получение результата `emit`

Когда при вызове `emit` нужен ответ от обработчика, передайте обработчик в `createAction`. Обработчик — функция `(payload, ctx) => result`, которая выполняется, когда action отправлен. `emit` запустит её и вернёт результат. Создатель один и для action без обработчика, и для action с ним; разница только в обработчике.

Шина живёт в одном файле, а её actions — в другом, так что любой модуль может импортировать оба без цикла.

```js
// bus.js
import { createBus } from "nanoeffects";

// createBus — одна шина на приложение
export const bus = createBus();
```

```js
// math.js
import { createAction } from "nanoeffects/actions";

// createAction с обработчиком — emit запускает обработчик и возвращает его результат
export const double = createAction("math/double", (value) => value * 2);
```

```js
import { bus } from "./bus";
import { double } from "./math";

bus.emit(double(21)); // 42
```

## Actions, handlers и jobs

```js
// user.js
import { createAction, createJob } from "nanoeffects/actions";

// createAction — action с payload (как createAction в RTK)
export const userLoaded = createAction("user/loaded");
export const loadFailed = createAction("user/failed");

// createAction с обработчиком — emit возвращает то, что вернул обработчик
export const getUser = createAction("user/get", (id, { signal }) => {
  return fetchUser(id, { signal });
});

// createJob — action с обработчиком, который ещё и отправляет actions success / fail
export const loadUser = createJob("user/load", fetchUser, {
  success: userLoaded,
  fail: "user/failed",
});
```

Это actions домена user в отдельном файле (`user.js`). Шина создаётся в другом файле (`bus.js` ниже), и ни один не импортирует другой.

### Actions

`createAction(type)` возвращает action creator. Без обобщений он сохраняет литеральный тип; шина проверяет payload по своей карте событий. Без карты событий укажите тип payload: `createAction<User>("user/loaded")`.

- `userLoaded(user)` → `{ type, payload }`
- `userLoaded.type` — строка типа
- `userLoaded.match(action)` — сужает тип action
- `createAction(type, handler)` — функция вторым аргументом — это обработчик; `bus.emit(action(payload))` сообщает подписчикам, запускает обработчик как задачу и возвращает его результат
- `createAction(type, { prepare })` — собрать payload из нескольких аргументов
- `createAction(type, { handle, prepare, ...scope })` — всё в одном объекте: `handle` и `prepare` извлекаются, а каждое остальное поле — это [scope](context.md#scope-поля-для-action-модуля-и-вызова)
- Работает как событие своего типа: `bus.emit(userLoaded(user))`, `bus.on(userLoaded, fn)`

Scope идёт после обработчика последним аргументом, `createAction(type, handler, scope)`; `prepare` вместе с обработчиком идёт в этот последний объект: `createAction(type, handler, { prepare, ...scope })`.

- Оберните обработчик в политику: `createAction("search", latest(fn))`.

Action без обработчика — это событие. Его отправка не выбрасывает ошибку, а `onUnhandled` узнаёт о нём, когда никто не слушает.

### Привязка обработчика позже

**Проблема.** Работа принадлежит другому слою, или тест должен её подменить. Если положить обработчик в `createAction`, файл события окажется связан с работой.

**Когда.** Используйте реестр, когда обработчик неизвестен там, где создаётся action. У action может не быть обработчика вовсе; ему отвечает обработчик, привязанный к его типу. У каждой шины (каждого теста) свой реестр.

```js
// mail.js
import { createAction } from "nanoeffects/actions";

// createAction без обработчика — событие; работа привязывается в другом месте
export const sendMail = createAction("mail/send");
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { actionsPlugin } from "nanoeffects/actions";

export const bus = createBus();

// actionsPlugin — реестр обработчиков этой шины
export const actions = bus.use(actionsPlugin());
```

```js
// mail-handlers.js
import { actions } from "./bus";
import { sendMail } from "./mail";

// actions.handle — привязывает работу к action на этой шине
actions.handle(sendMail, smtpSend);
```

```js
import { actions } from "./bus";
import { getUser } from "./user";

// позже, например в тесте — побеждает последняя привязка, а привязанный здесь обработчик главнее того, что в createAction
const unbind = actions.handle(getUser, async () => fakeUser);
unbind();
```

Обработчик, привязанный в реестре, заставляет `bus.emit(sendMail(mail))` запустить его и вернуть его результат, как и для action со своим обработчиком. Подписки на этот тип получают сообщение первыми. Если обработчик не привязан, `sendMail` снова просто событие.

Реестр живёт в `nanoeffects/actions`, поэтому шина без него этого кода не содержит. Без реестра `emit` запускает собственный обработчик action. `bus.use(actionsPlugin())` задаёт `bus.actions`. Второй `actionsPlugin` возвращает тот же реестр. В `createBus` нет параметра `actions`. Собственный исполнитель назначьте через `bus.actions = { run }`, а добавив ему `bound(type)`, вы сможете отвечать за actions без собственного обработчика.

### Тип результата привязанного обработчика

TypeScript не видит, какой обработчик лежит в реестре, поэтому тип `emit` для action без обработчика — `void`. Скажите ему, что возвращает привязанный обработчик, через `Call<Payload, Result>`. Это ваше обещание: ничто не сверяет его с обработчиком.

```ts
// mail.ts
import type { Call } from "nanoeffects";
import { createAction } from "nanoeffects/actions";

// Call — payload Mail, привязанный обработчик отвечает булевым значением (только для проверки типов; ничего не работает иначе)
type Mail = { to: string };
export const sendMail = createAction<Call<Mail, boolean>>("mail/send");
```

В карте событий тот же тип решает задачу для строковых событий, и `emit` возвращает `boolean`:

```ts
// events.ts
import type { Call } from "nanoeffects";

// Call в карте — payload проверяется, emit возвращает результат (только для проверки типов)
export type Events = {
  "user/getId": Call<void, string>;
  "user/loaded": { id: string };
};
```

На шине без карты событий это можно сказать в месте вызова: `const id = bus.emit<string>("user/getId")`. Шина с картой такой подсказки не принимает, поэтому её имена и payload остаются проверяемыми.

### Jobs

`createJob(type, handler, { pending, success, fail, cancel })` создаёт job: action с обработчиком, который ещё и отправляет свой исход как actions, когда никто не ждёт результат. Он возвращает action с `loadUser.pending`, `loadUser.success`, `loadUser.fail` и `loadUser.cancel` на нём.

- Когда обработчик стартует, отправляет `loadUser.pending(payload)`.
- При успехе отправляет `loadUser.success(result)`.
- При ошибке отправляет `loadUser.fail(error)`.
- Когда job прерван до завершения обработчика, отправляет `loadUser.cancel(reason)` вместо `success` или `fail`. После `pending` следует ровно одно из трёх.
- `pending` / `success` / `fail` / `cancel` — это строка (job создаёт action creator) или уже существующий action creator. Отсутствующие становятся `<type>/pending`, `<type>/success`, `<type>/fail` или `<type>/cancel`.
- `bus.emit(loadUser(id))` возвращает Promise результата. Ошибки обработчика всегда обрабатываются: они уходят в `fail`, а Promise завершается значением `undefined`. Для результата, который должен отклоняться, передайте обработчик в `createAction`.
- Исходы-actions отправляются от имени задачи, которая запустила job (и для обработчика, привязанного через `actions.handle`). `success` и `fail` после прерывания не отправляются; `cancel` отправляется в момент прерывания.
- Job без обработчика — не исход: `emit` выбрасывает `No handler for action "..."` и ничего не отправляется. Action без обработчика — событие и ошибку не выбрасывает.
- Вызов job лишь строит `{ type, payload }`; обработчик запускается на `emit`.
- Исходы — такие же события, как все остальные: если на шине задан `onUnhandled`, он вызывается для `pending` или `cancel`, которые никто не слушает.

## State работы job

**Проблема.** Спиннеру нужен флаг, который равен `true`, пока идёт запрос. Выставлять его вручную в обработчике (`loading = true`, затем `try` / `finally`) ломается, когда задача прерывается: `ctx.emit` после прерывания ничего не делает, поэтому флаг, сбрасываемый через шину, остаётся `true`.

**Когда.** UI показывает state загрузки для запроса, а запрос можно прервать (страницу покинули, вызван `ctx.abort()`). Пропустите это, если state ничего не показывает.

Job отправляет один action, когда обработчик стартует, и один, когда он заканчивается, как бы ни закончился. Store выставляет флаг на `pending` и сбрасывает на `success`, `fail` и `cancel`.

```js
// bus.js
import { createBus } from "nanoeffects";

// createBus — шина, общая для приложения
export const bus = createBus();
```

```js
// user.js
import { createJob } from "nanoeffects/actions";

// createJob — action с обработчиком, который ещё и отправляет pending, success, fail и cancel
export const loadUser = createJob("user/load", fetchUser);
```

```js
// user-store.js
import { bus } from "./bus";
import { loadUser } from "./user";

export const state = { loading: false, user: null };

// pending — обработчик стартует: показать спиннер
bus.on(loadUser.pending, () => {
  state.loading = true;
});

// success — обработчик вернул пользователя
bus.on(loadUser.success, (user) => {
  state.loading = false;
  state.user = user;
});

// fail — обработчик выбросил ошибку
bus.on(loadUser.fail, () => {
  state.loading = false;
});

// cancel — задача прервана: единственный способ сбросить флаг в этом случае
bus.on(loadUser.cancel, () => {
  state.loading = false;
});
```

```js
// page.js
import { bus } from "./bus";
import { loadUser } from "./user";

// emit — запускает задачу; state.loading равен true, как только он вернулся
bus.emit(loadUser("1"));
```

`cancel` отправляется в момент прерывания, с причиной прерывания. Обработчик, который игнорирует сигнал и заканчивает позже, больше ничего не отправляет, так что флаг уже `false`.

**С политикой.** Политика вроде `latest`, `leading`, `debounce`, `throttle` или `queue` вокруг обработчика сообщает job, что она делает с каждым вызовом:

- `pending` отправляется, когда обработчик действительно стартует: сразу для `leading`, после ожидания для `debounce`, когда подойдёт очередь для `queue`.
- Вызов, который политика отбрасывает до старта, ничего не отправляет, даже `pending`. Второй клик, который `leading` игнорирует, не сбрасывает флаг первого.
- Запуск, который заменяет `latest`, отправляет `cancel` раньше, чем следующий вызов отправит `pending`.
- За каждым `pending` следует ровно одно из `success`, `fail` и `cancel`, и без `pending` ничего не отправляется.

Флаг точен, когда вызовы не пересекаются или когда их заменяет `latest`. Если одновременно могут идти несколько запусков (`queue` с `concurrency` больше 1 или job без политики, вызванный много раз), ведите счётчик: прибавляйте единицу на `pending` и убавляйте на `success`, `fail` и `cancel`. Политика, которую вы написали сами или спрятали внутри собственной функции, job не сообщает; тогда `pending` отправляется в момент вызова, как для job без политики.

## Модули

**Проблема.** Домену нужно несколько подписок и привязок обработчиков. С обычными `bus.on` / `actions.handle` приходится помнить каждую отписку.

**Когда.** Домен нужно подключать и отключать одним вызовом. Пока хватает нескольких `bus.on` верхнего уровня, модули не нужны.

`bus.use(modulePlugin(modules))` собирает приложение из модулей и возвращает `mount`, `unmount`, `isMounted`, `dispose`, `actions` и `createModule`: то же, что `createModule` ниже, но с типизированными полями контекста шины (см. [TypeScript](typescript.md)).

```js
// user.js
import { createAction } from "nanoeffects/actions";

export const getUser = createAction("user/get");
export const saveUser = createAction("user/save", persistUser);
```

```js
// user-module.js
import { createModule } from "nanoeffects/actions";
import { getUser, saveUser } from "./user";

// createModule — один домен; unmount отменяет всё ниже
export const userModule = createModule("user", (m) => {
  m.handle(getUser, fetchUser);
  m.use(saveUser, authModule);
  m.on("login", (user, ctx) => {
    ctx.emit("loaded", user);
  });
  m.spawn(async (_, ctx) => {
    /* фоновая работа; заканчивается, когда модуль размонтируется */
  });
});
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { userModule } from "./user-module";

export const bus = createBus();
// modulePlugin — подключает модули к шине
export const app = bus.use(modulePlugin([userModule]));
```

```js
import { app } from "./bus";
import { getUser } from "./user";

const unmount = app.mount(orderModule); // позже, например после ленивого импорта
app.actions.handle(getUser, fakeUser); // в тесте
app.dispose(); // отключает каждый модуль
```

`mount` и `unmount` принимают любое число модулей. Они запускают домены приложения в выбранный вами момент и в заданном порядке, если вы не передаёте модули в `modulePlugin`:

```js
import { createModule } from "nanoeffects/actions";
import { app } from "./bus";

const userModule = createModule("user", (m) => {
  m.on("user/loaded", (user) => console.log(user));
});
const orderModule = createModule("order", (m) => {
  m.on("order/placed", (order) => console.log(order));
});

// mount — запустить оба модуля, слева направо
const stop = app.mount(userModule, orderModule);

// возвращённая функция снова останавливает их, последний подключённый первым (orderModule, затем userModule)
stop();

// то же для модулей, которые у вас уже лежат в массиве: разверните его
const modules = [userModule, orderModule];
app.mount(...modules);
app.unmount(...modules); // тоже в обратном порядке
```

Если `setup` одного модуля выбрасывает ошибку, модули этого вызова, которые уже подключились, отключаются обратно, а ошибка выбрасывается, так что вызов подключает все свои модули или ни одного. Модуль, который уже подключён, пропускается.

- **Отключение отменяет всё**, что сделал модуль: подписки, привязанные обработчики, подмодули и фоновые задачи (прерываются).
- **Модуль известен по имени.** Подключение модуля с занятым именем заменяет подключённый (см. [Hot reload](hmr.md)).
- **Реестр.** Если первым выполнился `bus.use(actionsPlugin())`, используется тот реестр; иначе плагин модулей подключает свой собственный. В любом случае это `bus.actions` и `app.actions`.
- Приложение после `dispose` не может подключать модули.
- **Переданные модули подключаются в конце блока, создавшего приложение**, либо при первом использовании приложения или шины, если оно случится раньше (первый `bus.emit` или вызов `mount`, `unmount`, `isMounted`, `dispose` либо чтение `actions`). Приложение использовать не обязательно: чтобы запустить модули, хватит `bus.use(modulePlugin([a, b]))`. Плагины, которые вы подключаете после `modulePlugin` в том же блоке, всё равно до них доходят, потому что модули ждут окончания этого блока. Плагин, подключённый после `await`, может опоздать: подключайте каждый плагин до первого `await`. Вызовы `bus.on`, сделанные в промежутке, удерживаются и выполняются сразу после, так что подписки модуля остаются впереди них. См. [плагины в любом порядке](plugins.md#порядок-подключения).
- **Чтобы подключать вручную**, не передавайте модули: `modulePlugin()` ничего не запускает, а `app.mount(...)` запускает модули, когда вам нужно.
- Контекст модуля = контекст задачи плюс `handle`, `use` и `spawn`:
  - `handle` — дать action обработчик (тому, у кого его нет, или переопределить).
  - `use` — подключить подмодули и actions, несущие обработчик; возвращённая функция отменяет этот вызов.
  - `spawn` — фоновая задача, прерывается при отключении.
- Action, несущий обработчик, продолжает отвечать и после отключения (`use` лишь отслеживает регистрацию). Для обработчика, который должен жить только пока жив модуль, используйте `handle`.

## Расширение контекста actions и модулей

Action с обработчиком может понадобиться свой клиент, модулю — свой логгер. Передайте scope — обычный объект, ключи которого попадают на `ctx` (`$effects` привязывает функции к задаче), последним аргументом `createAction`, `createModule` и `createJob`, и включите его через `scopePlugin`:

```js
// bus.js
import { createBus } from "nanoeffects";
import { scopePlugin } from "nanoeffects/scope";

// scopePlugin — включает scope action на этой шине
export const bus = createBus().use(scopePlugin());
```

```js
// user.js
import { createAction } from "nanoeffects/actions";

// третий аргумент — поля только этого action
export const getUser = createAction(
  "user/get",
  (id, { api }) => api.getUser(id),
  { api },
);
```

```js
import { bus } from "./bus";
import { getUser } from "./user";

// тест подменяет их для одного вызова
const fakeApi = { getUser: async (id) => ({ id, name: "test" }) };
bus.emit(getUser("1"), { api: fakeApi });
```

Обработчик получает поля с типами. Без `scopePlugin` scope игнорируется. Полная картина, с задачами, actions, модулями и тем, какое значение побеждает, описана в [областях (scope)](context.md#scope-поля-для-action-модуля-и-вызова).
