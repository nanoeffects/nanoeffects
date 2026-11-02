# Случаи отладки

> **[Уровень F](README.md#виды-проектов)**: платформа, SDK или долгоживущее приложение. Сначала прочитайте: [Трассировка задач](tracing.md#подключение-трассировщика).

Прочитайте эту страницу, когда что-то идёт не так и нужно понять, кто слушает событие, что начало цепочку или почему остановился запрос. Каждый случай ниже — короткий пример, который можно запустить. О циклах читайте в разделе [Поиск и обрыв циклов событий](debugging-loops.md).

## На этой странице

- [Кто слушает событие](#кто-слушает-событие)
- [Какая задача начала цепочку](#какая-задача-начала-цепочку)
- [Почему запрос остановился](#почему-запрос-остановился)
- [Чего не хватает](#чего-не-хватает)

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

- **Нет расширения для браузера и своего интерфейса.** Используйте [Redux DevTools](tracing.md#настройка-redux-devtools), консоль или панель Performance.
- **Нет карты по исходному коду.** `describeBus` показывает обработчики, зарегистрированные к этому моменту, а `graphLogger` — события, которые произошли. Обработчик, который ещё не зарегистрирован, на карте не появится.
- **Нет перехода из лога в код.** С `tracePlugin({ source: true })` событие несёт `file:line:column` своего обработчика ([Строка кода обработчика](tracing.md#строка-кода-обработчика)), но ссылку в интерфейсе вы делаете сами.
- **Нет имён от компилятора.** Имена функций дают имя бесплатно; минификатор может их сократить, поэтому используйте `traceId`, где имя должно быть стабильным.
- **Нет повтора и путешествий во времени.** Recorder хранит то, что случилось, и не умеет запускать это заново.
