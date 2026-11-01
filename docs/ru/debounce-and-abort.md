# Пауза между запросами

> **[Уровень B](README.md#виды-проектов)**: SPA с async UI. Сначала прочитайте: [Политики](policies.md).

Debounce пользовательского ввода (поле поиска, автосохранение, обработчик resize), когда запрос в полёте должен останавливаться при новом вводе. Один `debounce` ждёт паузы, но не отменяет уже стартовавший запрос. Как совместить две политики, в каком порядке их ставить и когда нужен `throttle`.

## Политики

| Политика | Что делает | Чего не делает |
| -------- | ---------- | -------------- |
| `debounce(ms, fn)` | запускает `fn` через `ms` без нового вызова | не отменяет запуск, который уже начался |
| `latest(fn)` | прерывает предыдущий запуск, когда начинается новый | не ждёт паузы |

Для поля поиска используйте обе. `debounce` отправляет меньше запросов. `latest` отменяет медленный, когда пользователь снова печатает после паузы.

## Совместное использование debounce и latest

Поставьте `debounce` снаружи, а `latest` внутри. Сначала событие ждёт паузы. Когда запуск начинается, он прерывает предыдущий запуск.

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

// latest: новый запуск прерывает старый запрос
const searchLatest = latest(async (query, { signal }) => {
  // signal: передайте его дальше, чтобы браузер сам отменил запрос
  const items = await api.search(query, { signal });
  render(items);
});

// debounce: запуск searchLatest через 300 мс без нового "typed"
bus.on("typed", debounce(300, searchLatest));
```

Что заменить: `api.search` — ваша функция запроса. Она должна принимать `{ signal }` и передавать его в `fetch`. `render` показывает элементы.

Результат: ввод `a`, `ab`, `abc` в пределах 300 мс отправляет один запрос для `abc`. Если пользователь печатает `abcd`, пока этот запрос идёт, запрос для `abc` прерывается, а после паузы стартует запрос для `abcd`.

## Первый вызов сразу

По умолчанию `debounce` ждёт даже перед первым вызовом. Чтобы первое нажатие срабатывало сразу, добавьте `leading: true`. Первый вызов серии выполняется немедленно, последний — после паузы.

```js
import { createBus } from "nanoeffects";
import { debounce } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

const showSuggestions = (query) => console.log("suggest", query);

// debounce с leading: первый вызов выполняется сразу, последний — после 300 мс тишины
bus.on("typed", debounce(300, showSuggestions, { leading: true }));
```

`leading` и `trailing` следуют lodash. Все сочетания: [Политики](policies.md#настройка-debounce-и-throttle).

## Непрерывный ввод: throttle

`debounce` не срабатывает, пока вызовы продолжают приходить. Для прокрутки и перетаскивания нужны обновления во время движения. Возьмите `throttle`: не больше одного запуска за период.

```js
import { createBus } from "nanoeffects";
import { throttle } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

const saveScroll = (position) => localStorage.setItem("scroll", String(position));

// throttle: не больше одного запуска за 100 мс, пока "scrolled" продолжает приходить
bus.on("scrolled", throttle(100, saveScroll));
```

## Debounce без шины

Если шины нет, оберните ту же пару в `withPolicy`. Получится обычная функция для обработчика ввода.

```js
import { debounce, latest, withPolicy } from "nanoeffects/policies";

// latest: новый запуск прерывает старый запрос
const searchLatest = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  console.log(items);
});

// withPolicy: debounce на 300 мс, вызывается как обычная функция
const onTyped = withPolicy(debounce(300, searchLatest));

onTyped("a");
onTyped("ab"); // выполнится только "ab", через 300 мс

// cancel: отбросить ожидающий вызов и прервать выполняющийся запрос, например при уходе со страницы
onTyped.cancel();
```

В компоненте React берите [`usePolicy`](react.md#обработчик-с-debounce-между-рендерами): он ещё и отменяет вызовы при размонтировании.

## Что проверить, если отмены нет

- Запрос не получил `signal`: `latest` отбросит старый результат, но запрос продолжится.
- Порядок перепутан. Пишите `debounce(300, latest(handler))`: `debounce` принимает события, `latest` охраняет запрос.
- Несколько полей используют одно событие. Дайте каждому своё имя события или задайте `{ key }`, например `latest(handler, { key: (input) => input.id })`.

