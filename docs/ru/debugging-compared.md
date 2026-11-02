# Отладка в сравнении с RxJS, Effector и mitt

> **[Уровень F](README.md#виды-проектов)**: платформа, SDK или долгоживущее приложение. Сначала прочитайте: [Трассировка задач](tracing.md#подключение-трассировщика).

Прочитайте эту страницу, если знаете RxJS, Effector или mitt и хотите понять, что nanoeffects даёт, когда что-то идёт не так, а чего не даёт. Сначала сравнивается, что показывает каждый инструмент, затем разбираются три вопроса, которые вы задаёте отладчику. Это не руководство по переходу: для него есть страницы про [RxJS](migrating-from-rxjs.md), [Effector](migrating-from-effector.md) и [mitt](migrating-from-mitt.md).

## На этой странице

- [Сравнение того, что видно](#сравнение-того-что-видно)
- [Кто слушает событие](#кто-слушает-событие)
- [Какая задача начала цепочку](#какая-задача-начала-цепочку)
- [Почему запрос остановился](#почему-запрос-остановился)
- [Чего не хватает](#чего-не-хватает)

## Сравнение того, что видно

| Вопрос | nanoeffects | RxJS | Effector | mitt / nanoevents |
| ------ | ----------- | ---- | -------- | ----------------- |
| Какая задача запустила какую? | Да: у каждой задачи есть `parentId` и `rootId` ([Трассировка задач](tracing.md)) | Вы добавляете `tap` на каждый поток или берёте инструмент вроде [rxjs-spy](https://github.com/cartant/rxjs-spy) | Да, через [`effector-logger`](https://github.com/effector/logger) и [inspector](https://github.com/effector/inspector) | Нет |
| Вызов прерван или отброшен? | Да: фазы `cancel` и `drop` | Отписка не даёт события, пока вы его не добавите | — | Нет |
| Лог каждого emit | `tracePlugin` сообщает о каждом emit, и без подписчиков | `tap` на каждый поток | Логгер над юнитами | Подписка на `"*"` |
| Карта приложения | `describeBus` до запуска, `graphLogger` после ([Поиск и обрыв циклов событий](debugging-loops.md)) | Нет встроенной | Граф юнитов, имена даёт плагин Babel/SWC | `emitter.all` хранит обработчики каждого события (mitt) |
| Поиск цикла | `graphLogger`, а `loopGuardPlugin` обрывает его | — | — | Нет |
| Тест потока | [`createTraceRecorder`](tracing.md#последние-события-на-случай-инцидента) | [Marble-тесты](https://rxjs.dev/guide/testing/marble-testing) | `fork` даёт изолированный scope | Подключение вы пишете сами |

Прочерк значит, что эта страница клетку не сравнивает. Читайте таблицу как карту того, где искать, а не как оценку. Effector и RxJS ещё хранят state и потоки, чего nanoeffects не делает, поэтому их инструменты охватывают больше. nanoeffects глубоко решает одну задачу: почему выполнился асинхронный обработчик и почему он остановился.

## Кто слушает событие

**Проблема.** Вы читаете emit и хотите знать, что он запускает.

Назовите обработчики функциями или через `traceId`, подключите `tracePlugin` и вызовите `describeBus`:

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, describeBus, tracePlugin } from "nanoeffects/trace";

function saveName(name) {
  console.log("save", name);
}

function audit(name) {
  console.log("audit", name);
}

const trace = createTracer(consoleLogger());

const bus = createBus({ trace })
  .use(tracePlugin());

bus.on("name/changed", saveName);
bus.on("name/changed", audit);

// describeBus: обработчики каждого события в порядке запуска
console.log(describeBus(bus));
```

```
{ "name/changed": ["saveName", "audit"] }
```

Подробнее: [Список подписчиков события](tracing.md#список-подписчиков-события).

## Какая задача начала цепочку

**Проблема.** Запрос выполнился, а вы не знаете, что его запросило.

У каждой задачи трассировки есть `rootId` и `parentId`. Recorder хранит их, поэтому от запроса можно подняться к emit, который начал цепочку:

```js
import { createBus } from "nanoeffects";
import { createTraceRecorder, createTracer, tracePlugin } from "nanoeffects/trace";

// createTraceRecorder: хранит последние события в памяти
const recorder = createTraceRecorder();
const trace = createTracer(recorder);

const bus = createBus({ trace })
  .use(tracePlugin());

function loadUser(id, ctx) {
  ctx.emit("user/loading", id);
}

bus.on("user/open", loadUser);
bus.emit("user/open", 7);

// каждое событие говорит, какая задача его родитель
for (const event of recorder.events) {
  console.log(event.id, event.parentId, event.type, event.phase);
}
```

Подробнее: [Какая подписка начала цепочку](tracing.md#какая-подписка-начала-цепочку) и [Сохранение цепочки: `ctx.emit` вместо `bus.emit`](tracing.md#сохранение-цепочки-ctxemit-вместо-busemit).

## Почему запрос остановился

**Проблема.** Запрос поиска не завершился, а ошибки нет.

Политика, которая останавливает вызов, пишет в трассировку `cancel` или `drop`. Найдите вызов и прочитайте его последнюю фазу:

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { createTraceRecorder, createTracer, tracePlugin } from "nanoeffects/trace";

const recorder = createTraceRecorder();
const trace = createTracer(recorder);

const bus = createBus({ trace })
  .use(tracePlugin());

// latest: новый поиск останавливает тот, что ещё выполняется
const search = latest(async (query, ctx) => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  ctx.emit("search/loaded", query);
});

bus.on("search/changed", search, { traceId: "search" });
bus.emit("search/changed", "a");
bus.emit("search/changed", "ab");

// фаза "cancel" у первого вызова говорит, что его остановил второй
const phases = recorder.events.map((event) => `${event.type}:${event.phase}`);
console.log(phases);
```

Подробнее: [Трассировка задач](tracing.md) и [Отмена устаревших запросов](cancel-stale-requests.md).

## Чего не хватает

- **Нет расширения для браузера и своего интерфейса.** Используйте [Redux DevTools](tracing.md#настройка-redux-devtools), консоль или панель Performance. У Effector для этого есть inspector.
- **Нет карты по исходному коду.** `describeBus` показывает обработчики, зарегистрированные к этому моменту, а `graphLogger` — события, которые произошли. Обработчик, который ещё не зарегистрирован, на карте не появится.
- **Нет перехода из лога в код.** С `tracePlugin({ source: true })` событие несёт `file:line:column` своего обработчика ([Строка кода обработчика](tracing.md#строка-кода-обработчика)), но ссылку в интерфейсе вы делаете сами.
- **Нет имён от компилятора.** Имена функций дают имя бесплатно; минификатор может их сократить, поэтому используйте `traceId`, где имя должно быть стабильным.
- **Нет повтора и путешествий во времени.** Recorder хранит то, что случилось, и не умеет запускать это заново.
