# Подключение Redux, Zustand, MobX и Pinia

> **Уровень E.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Эта страница нужна, когда у вас **уже есть стор** и вы хотите async-работу с отменой и политиками рядом с ним. Это не повод выбирать Redux (или любой стор).

Если стора у вас ещё нет, используйте `createBus` из [Руководства](guide.md).

## На этой странице

- [Подключите Redux Toolkit к шине](#подключите-redux-toolkit-к-шине)
- [Отправляйте события из менеджера состояния](#отправляйте-события-из-менеджера-состояния)
  - [Nanostores](#nanostores)
  - [MobX](#mobx)
  - [Valtio](#valtio)
  - [Jotai](#jotai)
  - [Zustand](#zustand)
  - [Pinia](#pinia)
  - [React: одно значение на несколько компонентов](#react-одно-значение-на-несколько-компонентов)
  - [Колбэки на каждое изменение](#колбэки-на-каждое-изменение)
  - [Перестаньте следить за стором](#перестаньте-следить-за-стором)
  - [Меняйте стор из любого обработчика](#меняйте-стор-из-любого-обработчика)

## Подключите Redux Toolkit к шине

`dispatch` в Redux → редьюсеры обновляют **состояние**. Полноценных **задач** (прервать работу в полёте, `latest` / `debounce` / `queue`, `retry` / `timeout`) он не даёт. Обычно для этого берут thunks, listener middleware из RTK или саги.

`createEffectsMiddleware(bus)` решает ту же задачу: после выполнения редьюсера действие попадает ещё и на шину nanoeffects, которую вы ему передали. Оставьте RTK для состояния; используйте политики и эффекты для async.

Пропустите этот раздел, если вы ещё не на Redux. Рецепт в виде файла, проверяемого типами вместе с проектом: [`examples/redux.ts`](../../examples/redux.ts). Чтобы запустить его, откройте [пример counter](../../examples/counter): `redux.html` — счётчик на Redux Toolkit с этим middleware.

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // шина вашего приложения; она может существовать до стора
```

```js
// user.js
import { createAction } from "@reduxjs/toolkit";

export const userRequested = createAction("user/requested"); // RTK
export const userLoaded = createAction("user/loaded");
```

```js
// store.js
import { configureStore } from "@reduxjs/toolkit";
import { createEffectsMiddleware } from "nanoeffects/redux";
import { bus } from "./bus";

// createEffectsMiddleware — действия попадают на шину после редьюсеров; задачи получают ctx.store
const effects = createEffectsMiddleware(bus);

export const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().concat(effects),
});
```

```js
// user-handlers.js
import { latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { userLoaded, userRequested } from "./user";

// latest — новый запуск прерывает старый
bus.on(
  userRequested,
  latest(async (id, { store, signal }) => {
    const user = await fetchUser(id, { signal });
    store.dispatch(userLoaded(user));
  }),
);
```

Строковые имена событий (`"user/requested"`) работают так же. Используйте ваши обычные действия RTK (`createSlice` / `createAction`). nanoeffects добавляет middleware и политики; действия RTK она не заменяет.

### Что гарантирует middleware

- **Нет самозацикливания.** Действие, которое обработчик отправляет через `ctx.store` и тип которого совпадает с тем, над которым работает этот обработчик, обратно на шину не попадает. Другие обработчики этого типа его тоже не получают. Более длинных циклов (`a` → `b` → `a`) вам предстоит избегать самим.
- **Упавший обработчик не ломает `dispatch`.** Если на шине задан `onError`, шина изолирует обработчики. Без него ошибка уходит в `console.error`, как в слушателях RTK. Редьюсеры по-прежнему выбрасывают ошибку вызывающему.
- **`store` доходит до задач, когда middleware установлено**, хотя шина создаётся раньше `configureStore`.

Единственный параметр — `filter`, который не пускает отклонённые действия на шину. Параметры шины (`onError`, `context`, `trace`) идут в `createBus`. Используйте одну шину на один стор. Значения, не являющиеся обычными действиями (thunks), проходят нетронутыми. Ничто здесь не зависит от пакета `redux` во время выполнения.

### Покажите, какой dispatch начал цепочку

Если на шине есть трассировщик и `tracePlugin`, каждое отправленное действие попадает на шину из корневой задачи трассировки. Назовите её через `traceId`, а поток соберите в группу через `traceGroupId`: `createEffectsMiddleware(bus, { traceId: "store", traceGroupId: "checkout" })`. Без `traceId` у корня тип действия. Без плагина параметры игнорируются. Подробнее в [Трассировке](tracing.md#покажите-какая-подписка-начала-цепочку).

### Типизируйте `ctx.store` (необязательно)

Только если вы хотите, чтобы TypeScript знал `store` у обработчиков. **В JavaScript это пропустите**: middleware уже кладёт `store` на задачу во время выполнения. Эти строки не связывают стор по всему приложению.

```ts
import { createBus, type WithContext } from "nanoeffects";
import {
  createEffectsMiddleware,
  type ReduxStoreApi,
} from "nanoeffects/redux";

// RootState — форма вашего состояния Redux (для getState)
type RootState = { user: string | null };

// Events — имя события → нагрузка для этой шины
// WithContext — только для проверки типов: у обработчиков есть и ctx.store
type Events = {
  "user/requested": string;
} & WithContext<{ store: ReduxStoreApi<RootState> }>;

const bus = createBus<Events>(); // карта событий типизирует ctx.store
const effects = createEffectsMiddleware(bus);
```

## Отправляйте события из менеджера состояния

У Zustand, MobX, Jotai, Valtio, Nanostores и Pinia адаптера нет. Redux — другое дело: используйте middleware из первого раздела, оно отправляет действия на шину. Обычный стор работает с шиной в двух направлениях, и оба показаны ниже для каждого стора:

- **Стор запускает событие.** Стор сообщает об изменении колбэком. Вы передаёте ему колбэк `bus.emitter(action)`, и изменение становится событием, которое запускает обработчик.
- **Событие меняет стор.** Обработчик сообщает результат событием. Слушатель шины берёт стор из `ctx` и меняет его мутацией.

Пример — поле поиска. В сторе два поля: `query`, которое печатает пользователь, и `results`, которое заполняет запрос. Изменение `query` запускает поиск с debounce; поиск заканчивается событием, которое записывает `results`.

Писать `(query) => bus.emit(queryChanged(query))` для каждой подписки значит повторять шину и действие. `emitterPlugin` добавляет `bus.emitter(action)`: он возвращает этот колбэк за вас. Действие остаётся обычным `createAction`, так что `bus.emit(queryChanged("nano"))` и `bus.on(queryChanged, …)` работают как раньше.

Шина получает стор как контекст: `contextPlugin({ store })` кладёт его на каждую задачу как `ctx.store` ([Поля контекста](context.md)). Тогда обработчик меняет стор его мутациями и никогда не обращается к стору по имени. Для каждого стора ниже различается только `store.js`. Он экспортирует `store` с теми же тремя членами:

- `setQuery(query)` и `setResults(items)` — мутации. Ввод пользователя вызывает первую, обработчик — вторую.
- `onQueryChanged(callback)` сообщает об изменении `query` и возвращает функцию, которая это останавливает.

Шина, события, обработчики и связь стора с шиной одинаковы для каждого стора, каждое в своём файле: шина не знает событий, а события не знают шины.

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";
import { contextPlugin } from "nanoeffects/context";
import { store } from "./store";

export const bus = createBus()
  .use(emitterPlugin()) // добавляет bus.emitter
  .use(contextPlugin({ store })); // ctx.store на каждой задаче
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — обычные создатели действий; вызов лишь строит { type, payload }
export const queryChanged = createAction("search/queryChanged");
export const searchLoaded = createAction("search/loaded");
```

```js
// search-handlers.js
import { debounce, latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// debounce — подождать 300 мс тишины; latest — прервать поиск предыдущего запроса
bus.on(
  queryChanged,
  debounce(
    300,
    latest(async (query, ctx) => {
      // api — ваш клиент; ctx.signal позволяет latest отменить сам запрос
      const items = await api.search(query, { signal: ctx.signal });
      ctx.emit(searchLoaded(items)); // сообщить результат событием
    }),
  ),
);

// событие → стор: стор берётся из ctx, а мутация его меняет
bus.on(searchLoaded, (items, { store }) => {
  store.setResults(items);
});
```

```js
// connect.js
import { bus } from "./bus";
import { queryChanged } from "./search";
import { store } from "./store";

// стор → событие: bus.emitter превращает колбэк в emit queryChanged
export const stopQuery = store.onQueryChanged(bus.emitter(queryChanged));
```

Записывайте `results`, а не то поле, за которым следите: обработчик, изменивший `query`, запустил бы сам себя снова. Найдите свой стор ниже.

### Nanostores

`action` создаёт именованную мутацию атома. `listen` вызывает колбэк с новым значением; `subscribe` вызвал бы ещё и сразу, с текущим значением, поэтому используйте `listen`.

```js
// store.js
import { action, atom } from "nanostores";

const $query = atom("");
const $results = atom([]);

export const store = {
  // action — именованная мутация атома
  setQuery: action($query, "setQuery", (target, query) => target.set(query)),
  setResults: action($results, "setResults", (target, items) => target.set(items)),
  // listen — вызывает колбэк с новым запросом при каждом изменении
  onQueryChanged: (callback) => $query.listen(callback),
};
```

### MobX

`makeAutoObservable` превращает методы класса в действия (actions) — именно там MobX хочет видеть изменения. `reaction` следит за выражением и вызывает колбэк с его значением.

<!-- docs-check: fork -->

```js
// store.js
import { makeAutoObservable, reaction } from "mobx";

class SearchStore {
  query = "";
  results = [];

  constructor() {
    makeAutoObservable(this); // методы ниже становятся действиями
  }

  setQuery(query) {
    this.query = query;
  }

  setResults(items) {
    this.results = items;
  }

  // reaction — следит за выражением и вызывает колбэк с его значением
  onQueryChanged(callback) {
    return reaction(() => this.query, callback);
  }
}

export const store = new SearchStore();
```

### Valtio

`subscribeKey` следит за одним полем прокси-состояния. Мутация присваивает значение прокси.

<!-- docs-check: fork -->

```js
// store.js
import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";

const state = proxy({ query: "", results: [] });

export const store = {
  setQuery(query) {
    state.query = query;
  },
  setResults(items) {
    state.results = items;
  },
  // subscribeKey — следит за одним полем
  onQueryChanged: (callback) => subscribeKey(state, "query", callback),
};
```

### Jotai

`sub` не передаёт значение, так что читайте его сами. Мутация — атом только для записи, а `set` его запускает.

<!-- docs-check: fork -->

```js
// store.js
import { atom, createStore } from "jotai";

const queryAtom = atom("");
const resultsAtom = atom([]);
const jotai = createStore();

// атомы только для записи: мутации
const setQueryAtom = atom(null, (_get, set, query) => set(queryAtom, query));
const setResultsAtom = atom(null, (_get, set, items) => set(resultsAtom, items));

export const store = {
  setQuery: (query) => jotai.set(setQueryAtom, query),
  setResults: (items) => jotai.set(setResultsAtom, items),
  // sub вызывает колбэк без значения; get его читает
  onQueryChanged: (callback) =>
    jotai.sub(queryAtom, () => callback(jotai.get(queryAtom))),
};
```

### Zustand

С `subscribeWithSelector` селектор выбирает поле, а колбэк вызывается только когда оно меняется. Без селектора Zustand вызывает колбэк при каждом `setState`, со всем состоянием. Мутации — функции в состоянии.

<!-- docs-check: fork -->

```js
// store.js
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

const useSearch = create(
  subscribeWithSelector((set) => ({
    query: "",
    results: [],
    // мутации — часть состояния
    setQuery: (query) => set({ query }),
    setResults: (items) => set({ results: items }),
  })),
);

export const store = {
  setQuery: (query) => useSearch.getState().setQuery(query),
  setResults: (items) => useSearch.getState().setResults(items),
  // селектор: колбэк получает state.query, только когда оно меняется
  onQueryChanged: (callback) => useSearch.subscribe((state) => state.query, callback),
};
```

### Pinia

Pinia (стор Vue) хранит реактивные объекты, а её `$subscribe` сообщает о каждой мутации стора, а не об одном поле. Вместо этого следите за одним геттером через `watch` из Vue: он вызывает колбэк с новым значением. Мутации — действия (actions) стора.

<!-- docs-check: fork -->

```js
// store.js
import { defineStore } from "pinia";
import { watch } from "vue";

// defineStore — Pinia: состояние и действия одного стора
const useSearch = defineStore("search", {
  state: () => ({ query: "", results: [] }),
  actions: {
    setQuery(query) {
      this.query = query;
    },
    setResults(items) {
      this.results = items;
    },
  },
});

const search = useSearch(); // вызывайте после того, как приложение установило Pinia

export const store = {
  setQuery: (query) => search.setQuery(query),
  setResults: (items) => search.setResults(items),
  // watch — вызывает колбэк с новым запросом, когда меняется search.query
  onQueryChanged: (callback) => watch(() => search.query, callback),
};
```

### React: одно значение на несколько компонентов

<!-- docs-check: new -->

У значения вашего UI (запрос, фильтр, имя) часто две задачи. Несколько компонентов читают его и перерисовываются при изменении, а шина должна услышать каждое изменение, чтобы запустить обработчик. Рецепты ниже различаются тем, где живёт значение. Выбирайте первый, если обработчику не нужно читать значение.

| Значение живёт в | Когда использовать |
| --- | --- |
| Провайдере Context с `useState` и `useEventState` | Его читают только компоненты. Чистый React, по одному вызову `useEmitter` и `useEventState`. |
| Небольшом сторе на `useSyncExternalStore` | Значение должны читать ещё и обработчик шины, тест или таймер. |
| Атоме библиотеки состояния | Вы уже используете Nanostores, Jotai и подобные. |

#### Чистый React: Context, `useEmitter` и `useEventState`

Запись `useEffect(() => bus.emit(...), [value])` выглядит достаточной, но она отправляет событие при монтировании, дважды при монтировании под StrictMode и срабатывает заново, когда функция emit каждый рендер новая. `useEmitter` из `nanoeffects/react` избегает всех трёх. Он отправляет событие после коммита рендера с изменённым значением, никогда при монтировании, и сравнивает через `Object.is`. Нужен React 18 или новее; другим точкам входа пакета React не нужен.

Сначала шина, события и обработчики, каждое в своём файле. `reactPlugin()` добавляет `bus.useEmitter` и `bus.useEventState`, а их деструктуризация даёт обычные хуки, которые вы экспортируете из файла шины:

```js
// bus.js
import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

export const bus = createBus().use(reactPlugin()); // шина; reactPlugin добавляет хуки React
export const { useEmitter, useEventState } = bus; // свободные хуки: они не читают `this`
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed");
export const searchLoaded = createAction("search/loaded");
```

```js
// search-handlers.js
import { debounce, latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// debounce — подождать 300 мс тишины; latest — новый запрос прерывает старый
bus.on(
  queryChanged,
  debounce(
    300,
    latest(async (query, ctx) => {
      const items = await api.search(query, { signal: ctx.signal });
      ctx.emit(searchLoaded(items)); // результат возвращается на шину событием
    }),
  ),
);
```

Затем провайдер. Он держит состояние, один раз вызывает `useEmitter`, чтобы отправить запрос на шину, и один раз `useEventState`, чтобы получить результат. Каждый компонент ниже только читает контекст:

```jsx
// SearchProvider.jsx
import { createContext, useContext, useState } from "react";
import { useEmitter, useEventState } from "./bus";
import { queryChanged, searchLoaded } from "./search";

const SearchContext = createContext(null);

export function SearchProvider({ children }) {
  const [query, setQuery] = useState("");

  // React → шина: отправляет queryChanged(query) после каждого изменения query, но не при монтировании
  useEmitter(queryChanged, query);

  // шина → React: как useState([]), но значение устанавливает searchLoaded; одна подписка на всё приложение
  const [items] = useEventState(searchLoaded, []);

  return (
    <SearchContext.Provider value={{ query, setQuery, items }}>
      {children}
    </SearchContext.Provider>
  );
}

export const useSearch = () => useContext(SearchContext);
```

```jsx
// Search.jsx
import { useSearch } from "./SearchProvider";

// любое число компонентов может читать одно и то же значение
export function SearchBox() {
  const { query, setQuery } = useSearch();
  return <input value={query} onChange={(event) => setQuery(event.target.value)} />;
}

export function Results() {
  const { items } = useSearch();
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.title}</li>
      ))}
    </ul>
  );
}
```

Три ограничения, которые нужно знать:

- **Провайдер должен смонтироваться первым.** `useEventState` — не стор: шина значений не хранит, поэтому результат, пришедший до монтирования провайдера или после его размонтирования, теряется. Ставьте провайдер в корень. Если значение должно пережить это, держите его в сторе ниже и записывайте в него из обработчика.
- **Все потребители перерисовываются** при любом изменении значения контекста. Если это медленно, разделите его на два контекста (`query` и `items`).
- **Новый объект считается изменением.** Для значения, которое пересоздаётся с тем же содержимым, передайте `equals` в параметрах, третьим аргументом, чтобы сказать, когда два значения одинаковы: `useEmitter(profileChanged, profile, { equals: (previous, next) => previous.id === next.id })`. Тот же объект принимает `traceId` и `traceGroupId`, которые называют подписку и поток в [трассировке](tracing.md#покажите-какая-подписка-начала-цепочку).

`useEmitter` отправляет событие после рендера, а не в момент `setQuery`. Чтобы отправлять на каждый вызов, даже с тем же значением, вызывайте эмиттер из обработчика события (`bus.emitter(action)`, см. [Zustand](#zustand)).

#### Значение, которое должен читать обработчик

Контекст не виден обработчику шины. Когда обработчику нужно текущее значение, держите значение вне React. Около двенадцати строк `useSyncExternalStore` это делают, а `contextPlugin` отдаёт его каждому обработчику как `ctx.query`:

<!-- docs-check: new -->

```jsx
// value-store.js
import { useSyncExternalStore } from "react";

export function createValue(initial) {
  let value = initial;
  const listeners = new Set();

  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) {
        return; // нет изменения — нет уведомления: это же останавливает циклы
      }
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useValue = (store) => useSyncExternalStore(store.subscribe, store.get);
```

```js
// query.js
import { createValue } from "./value-store";

export const query = createValue("");
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";
import { contextPlugin } from "nanoeffects/context";
import { query } from "./query";

// emitterPlugin добавляет bus.emitter; contextPlugin кладёт `query` на каждую задачу как ctx.query
export const bus = createBus().use(emitterPlugin()).use(contextPlugin({ query }));
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed");
export const refreshed = createAction("search/refreshed");
```

```js
// search-handlers.js
import { bus } from "./bus";
import { query } from "./query";
import { queryChanged, refreshed } from "./search";

// стор → шина: bus.emitter превращает действие в колбэк; одно место, любое число сеттеров
const emitQueryChanged = bus.emitter(queryChanged);
query.subscribe(() => emitQueryChanged(query.get()));

// обработчик читает текущее значение из ctx, кто бы его ни изменил
bus.on(refreshed, async (_payload, ctx) => {
  const items = await api.search(ctx.query.get(), { signal: ctx.signal });
  console.log(items.length);
});
```

```jsx
// SearchBox.jsx
import { query } from "./query";
import { useValue } from "./value-store";

// любое число компонентов читает и пишет одно и то же значение
export function SearchBox() {
  const text = useValue(query);
  return <input value={text} onChange={(event) => query.set(event.target.value)} />;
}
```

#### Библиотека состояния

С Nanostores, Jotai или Zustand значение уже живёт вне React и имеет подписку. Подключите его к шине один раз, как в [Nanostores](#nanostores), и читайте в компонентах собственным хуком библиотеки:

<!-- docs-check: new -->

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";

export const bus = createBus().use(emitterPlugin()); // добавляет bus.emitter
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed");
```

```jsx
// SearchBox.jsx
import { atom } from "nanostores";
import { useStore } from "@nanostores/react";
import { bus } from "./bus";
import { queryChanged } from "./search";

const $query = atom("");

// listen, а не subscribe: listen пропускает вызов с текущим значением при старте
$query.listen(bus.emitter(queryChanged));

export function SearchBox() {
  const query = useStore($query); // хук Nanostores; перерисовывает при каждом изменении
  return <input value={query} onChange={(event) => $query.set(event.target.value)} />;
}
```

#### Не отправляйте события внутри редьюсера `useReducer`

React может запустить редьюсер больше одного раза на один dispatch (дважды в StrictMode), так что `bus.emit` внутри него сработает дважды. Сначала отправьте в редьюсер, затем emit, из одного помощника. Либо держите состояние в редьюсере и передайте его в `useEmitter`, как любое другое значение.

<!-- docs-check: new -->

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // шина: создаётся один раз
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed");
export const queryCleared = createAction("query/cleared");
```

```jsx
// Search.jsx
import { useReducer } from "react";
import { bus } from "./bus";
import { queryChanged, queryCleared } from "./search";

function reducer(state, action) {
  if (queryChanged.match(action)) {
    return action.payload;
  }
  if (queryCleared.match(action)) {
    return "";
  }
  return state;
}

export function Search() {
  const [query, dispatch] = useReducer(reducer, "");

  // send: сначала редьюсер, затем шина (bus.emit принимает действие)
  function send(action) {
    dispatch(action);
    bus.emit(action);
  }

  return (
    <div>
      <input value={query} onChange={(event) => send(queryChanged(event.target.value))} />
      <button type="button" onClick={() => send(queryCleared())}>
        Clear
      </button>
    </div>
  );
}
```

Обычный `dispatch` обходит шину, поэтому везде вызывайте `send`.

### Колбэки на каждое изменение

Сторы выше вызывают колбэк, только когда значение изменилось, поэтому эмиттеру не нужно сравнивать значения. Для стора, который вызывает колбэк на каждое изменение, сначала выберите меньшее значение, как это делает Zustand выше.

### Перестаньте следить за стором

`connect.js` хранит функцию, которую вернул `onQueryChanged` (`stopQuery`). Вызовите её сами или передайте дальше: `onAbort(ctx, stopQuery)` внутри задачи или `m.signal.addEventListener("abort", stopQuery)` в модуле. Чтобы остановить обратное направление, снимите слушателя `searchLoaded` через `bus.off(searchLoaded, handler)` или зарегистрируйте его в модуле, который снимет его при отключении.

### Меняйте стор из любого обработчика

Обработчик берёт стор из `ctx.store` и вызывает мутацию, что бы он ни обрабатывал: не только результат поиска. Правило то же: записывайте поле, за которым не следите. Для `flow` в MobX `onAbort(ctx, () => promise.cancel())` отменяет его вместе с задачей.
