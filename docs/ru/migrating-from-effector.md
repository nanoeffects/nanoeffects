# Переход с Effector

> **[Уровень E](README.md#виды-проектов)**: для тех, кто знает Effector. Сначала прочитайте: [Руководство](guide.md#1-создание-шины-событий).

Библиотеки пересекаются в одном: события, запускающие эффекты. Effector ещё и хранит state, а nanoeffects — нет. Имена сопоставлены, один эффект показан в обоих вариантах, перечислено то, у чего аналога нет.

## На этой странице

- [Разделение работы](#разделение-работы)
- [Соответствие](#соответствие)
- [Переписанный эффект](#переписанный-эффект)
  - [State в Zustand](#state-в-zustand)
- [Переписанная форма](#переписанная-форма)
  - [Запрос вместо лога](#запрос-вместо-лога)
- [Совместное использование в одном приложении](#совместное-использование-в-одном-приложении)
- [Отличия](#отличия)

## Разделение работы

| Задача | Использовать |
| ------ | ------------ |
| Хранить state (`createStore`, `combine`, `restore`) | Effector или любой store: [State managers](stores.md) |
| Выводить state из событий (`.on`, `sample` в store) | Effector или любой store |
| Запускать запрос, когда происходит событие, отменять, повторять, ограничивать по времени, трассировать | nanoeffects |

В nanoeffects store нет. Вместо `createStore` возьмите любой store, например Zustand: store и его `set` выполняют работу `createStore` и `.on`. [State managers](stores.md) показывают, как с шиной работают Zustand, Redux, MobX, Jotai и другие. Если вы оставляете Effector, берите nanoeffects только для эффектов, которые запускает `createEffect`, чтобы управлять перекрывающимися вызовами.

## Соответствие

| Effector | nanoeffects |
| -------- | ----------- |
| `createEvent()` | имя события на шине или [`createAction`](actions.md) |
| вызов события `loaded(user)` | `bus.emit("loaded", user)` |
| `createEffect(handler)` | обработчик: `bus.on(event, handler)` |
| эффект с `done` и `fail` | [`createJob`](actions.md): отправляет actions успеха и ошибки |
| `effect.pending` | `job.pending`, `job.success`, `job.fail` и `job.cancel`: выставляйте и сбрасывайте флаг в своём store ([Покажите state загрузки](actions.md#state-работы-job)) |
| `sample({ clock, fn, target })` | `bus.on(clock, handler)` и `ctx.emit(target, …)` |
| `sample({ source: $store, clock })` | прочитать store из [поля контекста](context.md) в обработчике |
| `sample({ filter })` | `if` в обработчике |
| `debounce`, `throttle` из patronum | [`debounce`, `throttle`](policies.md) (те же правила, что у lodash, проверены в тестах) |
| брать только последний вызов эффекта | [`latest`](policies.md) |
| `attach` | [поле контекста](context.md): обработчик читает его из `ctx` |
| `fork()` и scope | один `createBus()` на scope |
| `createStore`, `combine`, `restore` | любой store, например Zustand, Redux, MobX или Jotai: см. [State managers](stores.md) |
| `watch`, `createWatch` | `bus.on(event, handler)` |
| `event.prepend(fn)` | функция, которую пишете вы, `(event) => ({ key, value })`; шине ничего не нужно |
| `useStoreMap({ store, keys, fn })` | селектор вашего store; с `useState` значение хранит компонент |
| `event.watch((e) => e.preventDefault())` | вызовите `event.preventDefault()` в обработчике `onSubmit` |

## Переписанный эффект

Поиск, который запускается на каждый запрос и реагирует на результат:

<!-- docs-check: skip - нужен effector, от которого проект не зависит -->
```js
// Effector
import { createEffect, createEvent, createStore, sample } from "effector";

const queryChanged = createEvent();
const searchFx = createEffect((query) => api.search(query));
const $items = createStore([]).on(searchFx.doneData, (_, items) => items);

sample({ clock: queryChanged, target: searchFx });
```

Если пользователь печатает быстро, несколько вызовов `searchFx` пересекаются, а старые не отменяются. Та же задача в nanoeffects отменяет устаревший запрос:

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

// latest: новый запрос прерывает запрос в полёте
const search = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  bus.emit("found", items);
});

bus.on("query-changed", debounce(300, search)); // debounce: запуск после 300 мс тишины
```

Store (`$items`) здесь нет. Оставьте его в Effector и обновляйте из события `found` или возьмите другой store. Следующий пример использует Zustand.

### State в Zustand

Без Effector `$items` нужно хранить в другом месте. Для этого подходит store Zustand: `create` заменяет `createStore`, а `setState` — `.on(searchFx.doneData, …)`. Обработчик пишет результат прямо в store, так что событие `found` не нужно. Компонент читает store селектором, как раньше `useUnit($items)`.

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // шина: только шина
```

```js
// search-store.js
import { create } from "zustand";

// create — Zustand: store заменяет $items
export const useSearchStore = create(() => ({ items: [] }));
```

```js
// search-handlers.js
import { debounce, latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { useSearchStore } from "./search-store";

// latest — новый запрос прерывает запрос в полёте; debounce — подождать 300 мс тишины
const search = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  useSearchStore.setState({ items }); // Zustand: заменяет .on(searchFx.doneData, …)
});

bus.on("query-changed", debounce(300, search));
```

```jsx
// Search.jsx
import { bus } from "./bus";
import { useSearchStore } from "./search-store";

export function Search() {
  const items = useSearchStore((state) => state.items); // Zustand: селектор читает items

  return (
    <div>
      <input onChange={(event) => bus.emit("query-changed", event.target.value)} />
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

`bus.emit("query-changed", …)` в `onChange` делает работу вызова события `queryChanged`. Чтобы запускать задачу ещё и при изменении store, см. [Zustand в «Stores»](stores.md#zustand).

## Переписанная форма

Форма из [рецепта по формам в документации Effector](https://effector.dev/en/recipes/react/forms/) состоит из пяти частей: события изменения поля (`fieldUpdate`), store значений (`$form`), события отправки (`formSubmitted`), эффекта, который их отправляет (`sendFormFx`), и `sample`, который читает store при отправке формы. Четыре из них хранят state или соединяют юниты. Аналог в nanoeffects есть только у эффекта.

<!-- docs-check: skip - нужен effector, от которого проект не зависит -->
```jsx
// Effector (адаптировано из документации Effector)
import { createEffect, createEvent, createStore, sample } from "effector";
import { useStoreMap } from "effector-react";

const formSubmitted = createEvent();
const fieldUpdate = createEvent();

const sendFormFx = createEffect((params) => {
  console.log(params);
});

const $form = createStore({});
$form.on(fieldUpdate, (form, { key, value }) => ({ ...form, [key]: value }));

// sample: когда форма отправлена, прочитать $form и запустить эффект с ним
sample({ clock: formSubmitted, source: $form, target: sendFormFx });

// prepend: превратить DOM-событие в { key, value }, которое принимает fieldUpdate
const handleChange = fieldUpdate.prepend((event) => ({
  key: event.target.name,
  value: event.target.value,
}));

const Field = ({ name, type, label }) => {
  const value = useStoreMap({
    store: $form,
    keys: [name],
    fn: (values) => values[name] ?? "",
  });

  return (
    <div>
      {label} <input name={name} type={type} value={value} onChange={handleChange} />
    </div>
  );
};

const App = () => (
  <form onSubmit={formSubmitted}>
    <Field name="login" label="Login" />
    <Field name="password" type="password" label="Password" />
    <button type="submit">Submit!</button>
  </form>
);

formSubmitted.watch((event) => {
  event.preventDefault();
});
```

Та же форма с nanoeffects. Значения живут в state React: nanoeffects их не хранит, и любой store из [Stores](stores.md) работает так же. Эффект становится обработчиком события отправки. Значения едут в событии, так что `sample` и `source` не нужны. Сначала шина и обработчик, каждый в своём файле:

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // шина: только шина
```

```js
// form-handlers.js
import { bus } from "./bus";

// bus.on — задача sendFormFx: выполняется, когда форма отправлена
bus.on("form/submitted", (values) => {
  console.log(values);
});
```

Затем форма. `useState` выполняет работу `$form`, `fieldUpdate` и `prepend`; обработчик события выполняет работу `watch`, который вызывал `preventDefault`:

```jsx
// App.jsx
import { useState } from "react";
import { bus } from "./bus"; // шина из предыдущего фрагмента
import "./form-handlers"; // регистрирует обработчик; приложение делает это один раз, при старте

function Field({ name, type, label, value, onChange }) {
  return (
    <div>
      {label} <input name={name} type={type} value={value} onChange={onChange} />
    </div>
  );
}

export function App() {
  const [form, setForm] = useState({}); // значения формы, как их хранил $form

  // один обработчик на каждое поле, как был handleChange
  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault(); // страница не должна перезагружаться; отдельный watcher не нужен
    bus.emit("form/submitted", form); // bus.emit — значения идут в событии
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field name="login" label="Login" value={form.login ?? ""} onChange={handleChange} />
      <Field
        name="password"
        type="password"
        label="Password"
        value={form.password ?? ""}
        onChange={handleChange}
      />
      <button type="submit">Submit!</button>
    </form>
  );
}
```

`useStoreMap` перерисовывает только то поле, значение которого изменилось. Здесь каждое поле перерисовывается вместе с формой, что нормально для небольшой формы. Если это важно, возьмите селектор вашего store (он есть у Zustand и Jotai).

Если значения живут в store вне React, передайте store обработчикам через `createBus({ context: { store } })` ([Поля контекста](context.md)) и читайте его в обработчике, как `sample` читал `$form`.

### Запрос вместо лога

`sendFormFx` только логирует. Настоящая регистрация отправляет запрос, и тогда важны двойной клик и сеть. `leading` отбрасывает вторую отправку, пока идёт первая, а `ctx.signal` позволяет отменить запрос:

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus(); // шина: события и их обработчики

// leading — вторая отправка игнорируется, пока идёт запрос
bus.on(
  "form/submitted",
  leading(async (values, ctx) => {
    // api — ваш клиент; ctx.signal позволяет отменить запрос
    await api.signUp(values, { signal: ctx.signal });
  }),
);
```

Повтор упавшего сетевого запроса и отмена при закрытии формы разобраны в [Форме регистрации на React](react.md).

## Совместное использование в одном приложении

Оставьте stores Effector и запускайте эффекты на шине. Store обращается к шине через `bus.emitter`, а обработчик возвращает результат событием, которое слушает store.

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";

export const bus = createBus().use(emitterPlugin()); // добавляет bus.emitter
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed"); // обычный action creator
```

<!-- docs-check: skip - нужен effector, от которого проект не зависит -->
```js
import { createEvent, createStore } from "effector";
import { latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { queryChanged } from "./search";

const found = createEvent(); // Effector: результат возвращается как событие
const $items = createStore([]).on(found, (_, items) => items);
const $query = createStore("");

// watch вызывает callback на каждое изменение store; bus.emitter превращает его в emit
$query.watch(bus.emitter(queryChanged));

bus.on(
  queryChanged,
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal });
    found(items); // обратно в Effector
  }),
);
```

## Отличия

- **Нет state.** Нет `createStore`, `combine`, `restore`, `$store.map`. Шина хранит только подписки. Для state возьмите store вроде Zustand ([State managers](stores.md)).
- **`pending` — action, а не store.** `createJob` отправляет `pending`, когда стартует обработчик, и `success`, `fail` или `cancel`, когда он заканчивается; флаг вы храните в своём store ([Покажите state загрузки](actions.md#state-работы-job)). Политики сообщают задаче, поэтому флаг следует и за `latest`, `leading`, `debounce`, `throttle` и `queue`; в разделе по ссылке выше сказано, когда вместо флага нужен счётчик. Выполняющуюся задачу видно и через [Трассировку](tracing.md).
- **Отмена — инструмент по умолчанию.** Эффект Effector выполняет каждый вызов до конца. Здесь `latest` и `ctx.signal` останавливают то, что больше не нужно.
- **События сопоставляются по имени, а не по идентичности.** Событие — это строка или action creator из `createAction`, а не юнит, который вы импортируете и вызываете. Два модуля договариваются об имени.
- **Нет графа.** `sample` и `forward` строят статический граф. Шина подписывает обработчики во время выполнения, а порядок вызова — порядок `on`.
- **Данные передаются в событии.** `sample({ source })` читает store в момент clock. Здесь отправитель кладёт значения в событие (`bus.emit("form/submitted", form)`), либо обработчик читает store из [поля контекста](context.md).
- **Scope — это шины.** `fork()` превращается в `createBus()` на каждый scope (тест, запрос на backend).
