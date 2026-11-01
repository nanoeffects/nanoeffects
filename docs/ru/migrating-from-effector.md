# Переход с Effector

> **Уровень E, для тех, кто знает Effector.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Страница для проектов на Effector, где нужно понять, какое место займёт nanoeffects. Библиотеки пересекаются в одном: события, запускающие эффекты. Effector ещё и хранит состояние, а nanoeffects — нет. Имена сопоставлены, один эффект показан в обоих вариантах, перечислено то, у чего аналога нет.

## На этой странице

- [Разделите работу](#разделите-работу)
- [Найдите соответствие](#найдите-соответствие)
- [Перепишите эффект](#перепишите-эффект)
  - [Храните состояние в Zustand](#храните-состояние-в-zustand)
- [Перепишите форму](#перепишите-форму)
  - [Замените лог запросом](#замените-лог-запросом)
- [Используйте оба в одном приложении](#используйте-оба-в-одном-приложении)
- [Чем это отличается](#чем-это-отличается)

## Разделите работу

| Задача | Использовать |
| ------ | ------------ |
| Хранить состояние (`createStore`, `combine`, `restore`) | Effector или любой стор: [Сторы](stores.md) |
| Выводить состояние из событий (`.on`, `sample` в стор) | Effector или любой стор |
| Запускать запрос, когда происходит событие, отменять, повторять, ограничивать по времени, трассировать | nanoeffects |

В nanoeffects стора нет. Вместо `createStore` возьмите любой стор, например Zustand: стор и его `set` выполняют работу `createStore` и `.on`. [Сторы](stores.md) показывают, как с шиной работают Zustand, Redux, MobX, Jotai и другие. Если вы оставляете Effector, берите nanoeffects только для эффектов, которые запускает `createEffect`, чтобы управлять перекрывающимися вызовами.

## Найдите соответствие

| Effector | nanoeffects |
| -------- | ----------- |
| `createEvent()` | имя события на шине или [`createAction`](actions.md) |
| вызов события `loaded(user)` | `bus.emit("loaded", user)` |
| `createEffect(handler)` | обработчик: `bus.on(event, handler)` |
| эффект с `done` и `fail` | [`createJob`](actions.md): отправляет actions успеха и ошибки |
| `effect.pending` | `job.pending`, `job.success`, `job.fail` и `job.cancel`: выставляйте и сбрасывайте флаг в своём сторе ([Покажите состояние загрузки](actions.md#покажите-состояние-загрузки-через-job)) |
| `sample({ clock, fn, target })` | `bus.on(clock, handler)` и `ctx.emit(target, …)` |
| `sample({ source: $store, clock })` | прочитать стор из [поля контекста](context.md) в обработчике |
| `sample({ filter })` | `if` в обработчике |
| `debounce`, `throttle` из patronum | [`debounce`, `throttle`](policies.md) (те же правила, что у lodash, проверены в тестах) |
| брать только последний вызов эффекта | [`latest`](policies.md) |
| `attach` | [поле контекста](context.md): обработчик читает его из `ctx` |
| `fork()` и scope | один `createBus()` на scope |
| `createStore`, `combine`, `restore` | любой стор, например Zustand, Redux, MobX или Jotai: см. [Сторы](stores.md) |
| `watch`, `createWatch` | `bus.on(event, handler)` |
| `event.prepend(fn)` | функция, которую пишете вы, `(event) => ({ key, value })`; шине ничего не нужно |
| `useStoreMap({ store, keys, fn })` | селектор вашего стора; с `useState` значение хранит компонент |
| `event.watch((e) => e.preventDefault())` | вызовите `event.preventDefault()` в обработчике `onSubmit` |

## Перепишите эффект

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

Стора (`$items`) здесь нет. Оставьте его в Effector и обновляйте из события `found` или возьмите другой стор. Следующий пример использует Zustand.

### Храните состояние в Zustand

Без Effector `$items` нужно хранить в другом месте. Для этого подходит стор Zustand: `create` заменяет `createStore`, а `setState` — `.on(searchFx.doneData, …)`. Обработчик пишет результат прямо в стор, так что событие `found` не нужно. Компонент читает стор селектором, как раньше `useUnit($items)`.

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // шина: только шина
```

```js
// search-store.js
import { create } from "zustand";

// create — Zustand: стор заменяет $items
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

`bus.emit("query-changed", …)` в `onChange` делает работу вызова события `queryChanged`. Чтобы запускать задачу ещё и при изменении стора, см. [Zustand в «Сторах»](stores.md#zustand).

## Перепишите форму

Форма из [рецепта по формам в документации Effector](https://effector.dev/en/recipes/react/forms/) состоит из пяти частей: события изменения поля (`fieldUpdate`), стора значений (`$form`), события отправки (`formSubmitted`), эффекта, который их отправляет (`sendFormFx`), и `sample`, который читает стор при отправке формы. Четыре из них хранят состояние или соединяют юниты. Аналог в nanoeffects есть только у эффекта.

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

Та же форма с nanoeffects. Значения живут в состоянии React: nanoeffects их не хранит, и любой стор из [Сторов](stores.md) работает так же. Эффект становится обработчиком события отправки. Значения едут в событии, так что `sample` и `source` не нужны. Сначала шина и обработчик, каждый в своём файле:

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

`useStoreMap` перерисовывает только то поле, значение которого изменилось. Здесь каждое поле перерисовывается вместе с формой, что нормально для небольшой формы. Если это важно, возьмите селектор вашего стора (он есть у Zustand и Jotai).

Если значения живут в сторе вне React, передайте стор обработчикам через `createBus({ context: { store } })` ([Поля контекста](context.md)) и читайте его в обработчике, как `sample` читал `$form`.

### Замените лог запросом

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

## Используйте оба в одном приложении

Оставьте сторы Effector и запускайте эффекты на шине. Стор обращается к шине через `bus.emitter`, а обработчик возвращает результат событием, которое слушает стор.

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

// watch вызывает callback на каждое изменение стора; bus.emitter превращает его в emit
$query.watch(bus.emitter(queryChanged));

bus.on(
  queryChanged,
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal });
    found(items); // обратно в Effector
  }),
);
```

## Чем это отличается

- **Нет состояния.** Нет `createStore`, `combine`, `restore`, `$store.map`. Шина хранит только подписки. Для состояния возьмите стор вроде Zustand ([Сторы](stores.md)).
- **`pending` — action, а не стор.** `createJob` отправляет `pending`, когда стартует обработчик, и `success`, `fail` или `cancel`, когда он заканчивается; флаг вы храните в своём сторе ([Покажите состояние загрузки](actions.md#покажите-состояние-загрузки-через-job)). Политики сообщают задаче, поэтому флаг следует и за `latest`, `leading`, `debounce`, `throttle` и `queue`; в этом разделе сказано, когда вместо этого нужно считать. Выполняющуюся задачу видно и через [Трассировку](tracing.md).
- **Отмена — инструмент по умолчанию.** Эффект Effector выполняет каждый вызов до конца. Здесь `latest` и `ctx.signal` останавливают то, что больше не нужно.
- **События сопоставляются по имени, а не по идентичности.** Событие — это строка или action creator из `createAction`, а не юнит, который вы импортируете и вызываете. Два модуля договариваются об имени.
- **Нет графа.** `sample` и `forward` строят статический граф. Шина подписывает обработчики во время выполнения, а порядок вызова — порядок `on`.
- **Событие несёт данные.** `sample({ source })` читает стор в момент clock. Здесь отправитель кладёт значения в событие (`bus.emit("form/submitted", form)`), либо обработчик читает стор из [поля контекста](context.md).
- **Scope — это шины.** `fork()` превращается в `createBus()` на каждый scope (тест, запрос на backend).
