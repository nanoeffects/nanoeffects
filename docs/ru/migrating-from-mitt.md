# Переход с mitt, nanoevents или EventEmitter

> **Уровень A, для тех, кто знает mitt или EventEmitter.** Сначала прочитайте: ничего, шина — та же идея.

Читайте эту страницу, если в вашем приложении используется небольшой эмиттер событий (`mitt`, `nanoevents`, `EventEmitter` из Node, `tiny-emitter`), а его обработчики начинают делать async-работу: запросы, таймеры, повторы. Здесь сопоставлены вызовы, показано, что вы выигрываете, и что проверить перед переходом.

## Когда переходить

Эмиттер вызывает функцию и забывает о ней. Этого хватает, пока обработчики синхронные. Переходите, когда обработчики начинают async-работу и вы упираетесь в одно из этого:

- старый запрос заканчивается после нового и затирает его результат;
- вы вручную храните объекты `AbortController`;
- вы сами пишете debounce, throttle или retry вокруг обработчиков;
- вы не можете сказать, какое событие запустило какой запрос.

Если обработчики остаются синхронными, оставьте ваш эмиттер. nanoeffects стоит около 1,4 кБ в gzip (1,3 кБ в brotli), что близко к небольшим эмиттерам.

## Найдите соответствие

| mitt / EventEmitter | nanoeffects |
| ------------------- | ----------- |
| `emitter.on("a", handler)` | `bus.on("a", handler)` |
| `emitter.off("a", handler)` | вызовите функцию, которую вернул `bus.on`, или `bus.off("a")` для всех обработчиков `a` |
| `emitter.emit("a", payload)` | `bus.emit("a", payload)` |
| `emitter.once("a", handler)` | `bus.once("a", handler)` |
| `on("*", (type, payload) => …)` | `bus.on("*", (payload, ctx) => …)`: имя события — `ctx.type` (см. [Руководство](guide.md)) |
| `emitter.all.clear()` | `bus.off()` |

Две различия, которые стоит знать:

- `bus.on` возвращает функцию отписки. Хранить обработчик, чтобы его снять, не нужно.
- Обработчик получает второй аргумент — контекст задачи: `(payload, ctx)`. Его можно игнорировать, пока не понадобится `ctx.signal` или `ctx.emit`.

## Перенесите обработчик

Было, с `mitt`:

<!-- docs-check: skip - нужен mitt, от которого проект не зависит -->
```js
import mitt from "mitt";

const emitter = mitt();

emitter.on("search", async (query) => {
  const items = await api.search(query);
  emitter.emit("results", items);
});

emitter.emit("search", "abc");
```

Стало, с nanoeffects. Первый шаг меняет только импорт и конструктор:

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // шина событий; каждый вызов обработчика — задача

bus.on("search", async (query) => {
  const items = await api.search(query);
  bus.emit("results", items);
});

bus.emit("search", "abc");
```

Второй шаг чинит гонку. Оберните обработчик в `latest` и передайте сигнал в запрос:

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus(); // шина событий; каждый вызов обработчика — задача

// latest: новый "search" прерывает старый запуск
bus.on(
  "search",
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal }); // signal отменяет запрос
    bus.emit("results", items);
  }),
);

bus.emit("search", "abc");
```

Другие случаи (пауза, повтор, таймаут): [Отмена устаревших запросов](cancel-stale-requests.md).

## Проверьте различия

| Тема | Эмиттер | nanoeffects |
| ---- | ------- | ----------- |
| Порядок обработчиков | порядок подписки | порядок подписки |
| Ошибка в обработчике | зависит от библиотеки | первая ошибка останавливает остальных и выбрасывается из `emit`; задайте `onError`, чтобы изолировать обработчики ([Ошибки](errors.md)) |
| Async-обработчик отклоняется | обычно необработанное отклонение | не обрабатывается без `onError`; задайте `onError`, чтобы его поймать |
| Событие без слушателя | игнорируется | игнорируется; задайте `onUnhandled`, чтобы узнавать |
| Типы | карта событий в параметре типа | карта событий в параметре типа ([TypeScript](typescript.md)) |

Точные правила `emit`, прерывания и порядка: [Семантика](semantics.md).
