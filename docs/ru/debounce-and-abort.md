# Debounce запроса и отмена предыдущего

> **Уровень B.** Сначала прочитайте: [Политики](policies.md).

Читайте эту страницу, если вы делаете debounce пользовательского ввода (поле поиска, автосохранение, обработчик resize) и хотите, чтобы запрос в полёте останавливался, когда начинается новый. Один `debounce` ждёт паузы. Он не отменяет запрос, который уже стартовал. Здесь показаны две политики вместе, порядок, в котором их ставить, и когда вместо этого использовать `throttle`.

## Что делает каждая политика

| Политика | Что делает | Чего не делает |
| -------- | ---------- | -------------- |
| `debounce(ms, fn)` | запускает `fn` через `ms` без нового вызова | не отменяет запуск, который уже начался |
| `latest(fn)` | прерывает предыдущий запуск, когда начинается новый | не ждёт паузы |

Для поля поиска используйте обе. `debounce` отправляет меньше запросов. `latest` отменяет медленный, когда пользователь снова печатает после паузы.

## Объедините их

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

Что заменить: `api.search` — ваша собственная функция запроса. Она должна принимать `{ signal }` и отдавать его в `fetch`. `render` показывает элементы.

Результат: ввод `a`, `ab`, `abc` в пределах 300 мс отправляет один запрос для `abc`. Если пользователь печатает `abcd`, пока этот запрос идёт, запрос для `abc` прерывается, а после паузы стартует запрос для `abcd`.

## Запустите первый вызов сразу

По умолчанию `debounce` ждёт даже перед первым вызовом. Если в поле ввода первое нажатие клавиши должно срабатывать сразу, добавьте `leading: true`. Первый вызов серии выполняется немедленно, а последний — после паузы.

```js
import { createBus } from "nanoeffects";
import { debounce } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

const showSuggestions = (query) => console.log("suggest", query);

// debounce с leading: первый вызов выполняется сразу, последний — после 300 мс тишины
bus.on("typed", debounce(300, showSuggestions, { leading: true }));
```

`leading` и `trailing` следуют lodash. Все сочетания: [Политики](policies.md#настройка-debounce-и-throttle).

## Для непрерывного ввода используйте throttle

`debounce` не срабатывает, пока вызовы продолжают приходить. Для прокрутки или перетаскивания нужны обновления во время движения. Используйте `throttle`: не больше одного запуска за период.

```js
import { createBus } from "nanoeffects";
import { throttle } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

const saveScroll = (position) => localStorage.setItem("scroll", String(position));

// throttle: не больше одного запуска за 100 мс, пока "scrolled" продолжает приходить
bus.on("scrolled", throttle(100, saveScroll));
```

## Debounce без шины

Если на странице нет шины, оберните ту же пару через `withPolicy`. Результат — обычная функция, которую вы вызываете из обработчика ввода.

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

В компоненте React используйте [`usePolicy`](react.md#сохраните-обработчик-с-debounce-между-рендерами), который ещё и отменяет вызовы при размонтировании.

## Что проверить, если отмены нет

- Запрос не получил `signal`. Тогда `latest` отбрасывает старый результат, но запрос продолжается.
- Порядок перевёрнут. Пишите `debounce(300, latest(handler))`, как выше, чтобы `debounce` принимал события, а `latest` охранял запрос.
- Несколько полей делят одно событие. Дайте каждому своё имя события или используйте `{ key }`, например `latest(handler, { key: (input) => input.id })`.

Связанное: [Отмена устаревших запросов](cancel-stale-requests.md), [Политики](policies.md).
