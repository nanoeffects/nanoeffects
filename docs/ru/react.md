# Форма регистрации на React

> **Уровень B.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Эта страница нужна, когда экран на React запускает запросы по вводу пользователя и они не должны гоняться друг с другом: проверка имени пользователя во время набора, кнопка отправки, ненадёжная сеть. Страница строит одну форму регистрации. Шина живёт вне React; компонент только подписывается на неё.

Нужен проект на React с установленной `nanoeffects`. Форма общается с вашим собственным клиентом, `api` ниже: замените его своими запросами.

## На этой странице

- [Что идёт не так без шины](#что-идёт-не-так-без-шины)
- [Подключите шину один раз](#подключите-шину-один-раз)
- [Подключите форму](#подключите-форму)
- [Остановите работающую работу, когда форма закрывается](#остановите-работающую-работу-когда-форма-закрывается)
- [Покажите последнее значение события как состояние](#покажите-последнее-значение-события-как-состояние)
- [Сохраните обработчик с debounce между рендерами](#сохраните-обработчик-с-debounce-между-рендерами)
- [Куда идти дальше](#куда-идти-дальше)

## Что идёт не так без шины

У формы регистрации три проблемы, которые `useEffect` и `fetch` оставляют вам:

- **Устаревший ответ.** Пользователь печатает `ann`, затем `anna`. Ответ для `ann` приходит последним и говорит, что имя свободно, хотя `anna` занято.
- **Двойная отправка.** Второй клик по «Зарегистрироваться» отправляет второй запрос, пока идёт первый.
- **Ненадёжная сеть.** Один упавший запрос нужно повторить, а ответ «имя занято» — нет.

У каждой есть политика или эффект: `latest`, `leading`, `retry`. Они живут в одном месте, вне компонента.

## Подключите шину один раз

Держите шину в отдельном файле, а обработчики формы — в другом. Создайте шину один раз, вне любого компонента: шина, созданная в теле компонента, была бы новой шиной без подписчиков на каждом рендере.

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // шина: создаётся один раз, в начале модуля
```

Обработчики знают шину, а шина ничего не знает о них. Они регистрируются, когда импортируется `registration.js`, один раз, при старте приложения:

```js
// registration.js
import { retry } from "nanoeffects/effects";
import { debounce, latest, leading } from "nanoeffects/policies";
import { bus } from "./bus";

// fetch отклоняется с TypeError при сбое сети; HTTP-ошибка — обычный Error
const isNetworkError = (error) => error instanceof TypeError;

// debounce — подождать 300 мс тишины; latest — прервать проверку предыдущего имени
bus.on(
  "username/typed",
  debounce(
    300,
    latest(async (name, ctx) => {
      // api — ваш клиент; передайте ctx.signal, чтобы latest мог отменить сам запрос
      const available = await api.usernameAvailable(name, { signal: ctx.signal });
      ctx.emit("username/checked", { name, available });
    }),
  ),
);

// leading — второй клик игнорируется, пока идёт первая регистрация
bus.on(
  "form/submitted",
  leading(async (form, ctx) => {
    const signUp = () => api.signUp(form, { signal: ctx.signal });
    try {
      // retry — до 3 попыток с паузой 500 мс и только если упала сеть
      const user = await retry(ctx, signUp, {
        times: 3,
        delay: 500,
        shouldRetry: isNetworkError,
      });
      ctx.emit("form/succeeded", user);
    } catch (error) {
      ctx.emit("form/failed", error.message);
    }
  }),
);
```

Обработчики ничего не знают о React. Тест может отправить `username/typed` и прочитать `username/checked`, ничего не рендеря: ту же связку проверяют [`examples/registration-form.ts`](../../examples/registration-form.ts) и `src/tests/registration-form.test.ts`.

## Подключите форму

<!-- docs-check: continue -->

Компонент хранит то, что показывает, в `useState`. Он подписывается в `useEffect` и отправляет события из своих обработчиков. `bus.on` возвращает функцию отписки; если вернуть её из эффекта, слушатель снимется при размонтировании. Если у компонента уже есть `AbortSignal`, `bus.on(event, handler, { signal })` заканчивает слушателя вместе с ним; см. [`signalPlugin`](plugins.md#привяжите-emit-или-слушателя-к-внешнему-сигналу-signalplugin).

```jsx
// SignUpForm.jsx
import { useEffect, useState } from "react";
import { bus } from "./bus"; // шина из предыдущего фрагмента
import "./registration"; // регистрирует обработчики; приложение делает это один раз, при старте

export function SignUpForm() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [available, setAvailable] = useState(null); // null: ещё не проверено
  const [status, setStatus] = useState("idle"); // idle, sending, done или failed
  const [error, setError] = useState("");

  useEffect(() => {
    // bus.on — слушать то, о чём сообщают обработчики; каждый вызов возвращает функцию отписки
    const unbindChecked = bus.on("username/checked", (result) => {
      setAvailable(result.available);
    });
    const unbindSucceeded = bus.on("form/succeeded", () => setStatus("done"));
    const unbindFailed = bus.on("form/failed", (message) => {
      setStatus("failed");
      setError(message);
    });

    return () => {
      unbindChecked();
      unbindSucceeded();
      unbindFailed();
    };
  }, []);

  function handleName(event) {
    const value = event.target.value;
    setName(value);
    setAvailable(null);
    bus.emit("username/typed", value); // bus.emit — обработчик делает debounce и проверяет имя
  }

  function handleSubmit(event) {
    event.preventDefault();
    setStatus("sending");
    bus.emit("form/submitted", { name, password }); // второй клик отбрасывает leading
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={handleName} placeholder="Username" />
      {available === false && <p>This name is taken</p>}
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button type="submit" disabled={status === "sending"}>Sign up</button>
      {status === "failed" && <p>{error}</p>}
      {status === "done" && <p>Welcome!</p>}
    </form>
  );
}
```

Кнопка `disabled` нужна только для вида. Форма остаётся корректной и без неё: `leading` отбрасывает вторую отправку, пока идёт первая.

При разработке React StrictMode запускает эффект дважды (подписка, отписка, подписка). Здесь это безопасно, потому что очистка снимает ровно то, что добавил эффект.

## Остановите работающую работу, когда форма закрывается

<!-- docs-check: continue -->

Отписка не даёт компоненту слышать результаты, но начавшийся запрос продолжает выполняться. Чтобы его отменить, компонент отправляет `form/closed` при размонтировании, а каждый обработчик, который должен остановиться, слушает его через `ctx.on`:

```js
import { latest } from "nanoeffects/policies";

// проверка имени из registration.js, с одной новой строкой
const checkName = latest(async (name, ctx) => {
  // ctx.on — подписка этой задачи; прерывание задачи заодно отбрасывает результат
  ctx.on("form/closed", () => ctx.abort());
  const available = await api.usernameAvailable(name, { signal: ctx.signal });
  ctx.emit("username/checked", { name, available });
});
```

В компоненте добавьте `bus.emit("form/closed")` в функцию очистки эффекта. Это необязательно: пропустите, если завершение запроса после размонтирования ничему не вредит, как для дешёвой проверки.

## Покажите последнее значение события как состояние

**Проблема.** Компоненту часто нужен последний результат события, например найденные элементы поиска. Рукописную форму легко чуть-чуть неверно написать:

<!-- docs-check: skip - рукописная форма, которую заменяет этот раздел -->
```jsx
useEffect(() => bus.on(searchLoaded, setFound), []);
```

Рядом нужен `useState`, пустой `[]` скрывает зависимость от события, и всё ломается, если нагрузка — функция, потому что React вызывает `setFound(payload)` как функцию-обновитель.

**Когда.** Значение, которое вы показываете, приходит с шины, а не из компонента. Для обратного направления, значения компонента, которое должна услышать шина, используйте `useEmitter`.

`useEventState(event, initial)` имеет сигнатуру `useState`: возвращает `[state, setState]`. `initial` — состояние до первого события, и это может быть функция, как в `useState`. После этого каждый `emit` события `event` устанавливает состояние в его нагрузку. Хук отписывается, когда компонент размонтируется.

```js
// bus.js
import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

// createBus — шина событий, создаётся один раз вне React
// reactPlugin — добавляет хуки bus.useEmitter и bus.useEventState
export const bus = createBus().use(reactPlugin());
export const { useEventState } = bus; // свободный хук: компоненты импортируют его без шины
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — имя события; обработчики отправляют его с найденными заголовками
export const searchLoaded = createAction("search/loaded");
```

```jsx
// Found.jsx
import { useEventState } from "./bus";
import { searchLoaded } from "./search";

export function Found() {
  // useEventState — как useState([]), но значение устанавливает searchLoaded
  const [found, setFound] = useEventState(searchLoaded, []);

  return (
    <>
      <ul>
        {found.map((title) => (
          <li key={title}>{title}</li>
        ))}
      </ul>
      <button onClick={() => setFound([])}>Clear</button>
    </>
  );
}
```

`setFound` — сеттер React. Он меняет состояние только этого компонента и ничего не отправляет.

`useEventState` — не стор. Каждый компонент, который его вызывает, хранит свою копию последней нагрузки, а компонент, смонтированный позже, ранних событий не видит. Чтобы разделить значение между компонентами или сохранить его для компонентов, которые смонтируются позже, держите его в менеджере состояния (Redux, Zustand, Jotai или другом) и записывайте в него из обработчика события. См. [Сторы](stores.md). Без менеджера состояния один `useEventState` в провайдере Context в корне делится значением со всеми компонентами ниже: [Чистый React: Context, `useEmitter` и `useEventState`](stores.md#чистый-react-context-useemitter-и-useeventstate).

В TypeScript тип состояния берётся из события: из `createAction<string[]>("search/loaded")` или из карты событий шины. Когда у события нет типа нагрузки, как в примере выше, он берётся из `initial`: `["a"]` — это `string[]`, а пустой `[]` — `unknown[]`. Дайте событию тип или передайте типизированный `initial`, когда нужно больше.

Шина не хранит значения, поэтому хук не может воспроизвести событие заново. Событие, отправленное до монтирования компонента, не видно: если это важно, прочитайте текущее значение в `initial`.

## Сохраните обработчик с debounce между рендерами

**Проблема.** Компонент запускается заново при каждом рендере. Политика, созданная в его теле, например `debounce(300, search)`, создаётся заново каждый раз и теряет свой таймер. Политика, созданная один раз, держит колбэк первого рендера, который читает старые props и state.

**Когда.** Обработчику в компоненте нужна политика, а шина вам не нужна: поле поиска, автосохранение, отправка, которая не должна сработать дважды.

`usePolicy(callback, make, deps)` держит одну функцию между рендерами. Она вызывает `callback` последнего рендера, так что встроенный колбэк видит свежее состояние. При размонтировании компонента она отменяет ожидающие вызовы.

```jsx
import { useState } from "react";
import { debounce } from "nanoeffects/policies";
import { usePolicy } from "nanoeffects/react";

export const Search = ({ wait }) => {
  const [items, setItems] = useState([]);

  // usePolicy — стабильная функция; первый аргумент — колбэк последнего рендера
  const onChange = usePolicy(
    async (query, { signal }) => {
      const found = await api.search(query, { signal });
      setItems(found);
    },
    // debounce(wait) — второй аргумент один раз строит политику вокруг колбэка выше
    debounce(wait),
    // deps — перечислите то, что читает второй аргумент; новый wait создаёт новую политику
    [wait],
  );

  return (
    <div>
      <input onChange={(event) => onChange(event.target.value)} />
      <p>{items.length} found</p>
    </div>
  );
};
```

- `onChange` сохраняет идентичность, пока `wait` не меняется, так что его безопасно использовать в `useEffect` и props.
- Ожидающий вызов отменяется при размонтировании и при смене `deps`.
- Пишите политику без её колбэка: `debounce(300)`, а не `debounce(300, callback)`. `usePolicy` подставляет колбэк сам, всегда колбэк последнего рендера.
- Чтобы объединить политики, напишите функцию от задачи: `(task) => throttle(100, latest(task))`. Здесь `task` — колбэк, который `usePolicy` держит актуальным; передавайте его, а не свою функцию.
- `deps` остаются на вас: `debounce(wait)` создаётся заново при каждом рендере, но используется только первый (и тот, что после смены `deps`).
- Вне компонента React используйте [`withPolicy`](policies.md#политика-без-шины).

## Куда идти дальше

- Политики за этой формой: [Политики](policies.md).
- Политика как обычная функция без шины: [Политика без шины](policies.md#политика-без-шины).
- `retry`, `timeout` и другие эффекты: [Эффекты](effects.md).
- Библиотека состояния вместо `useState`: [Сторы](stores.md).
- React Query или SWR вместо собственного состояния: [nanoeffects с React Query, SWR и RTK Query](query-libraries.md).
