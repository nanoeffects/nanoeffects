# nanoeffects в приложении на Vue

> **[Уровень B](README.md#виды-проектов)**: SPA с async UI. Сначала прочитайте: [Руководство](guide.md#1-создание-шины-событий).

Задача: компонент на Vue 3 должен сообщить шине, что значение изменилось (например, текст в поле поиска), и показать результат события (найденные элементы). Для этого `vuePlugin` даёт две функции. Работающий пример — шаблон `vue-ts` из [Проекта из шаблона](starter.md#начало-с-vue).

Нужны Vue 3.3 или новее и установленная `nanoeffects`. Не знакомы с шиной? Сначала прочитайте [Руководство](guide.md).

## Плагин на шине

**Проблема.** Без помощи компонент пишет `watch(query, (value) => bus.emit(queryChanged(value)))` и собственную подписку в `onMounted` и `onUnmounted`. Эти строки копируются в каждый компонент, и в каждой копии что-нибудь забыто: очистка, проверка равенства или имя подписки в трассировке.

**Когда.** Компонент Vue отправляет значения в шину, читает из неё события или делает и то и другое.

`vuePlugin()` добавляет на шину две функции. Достаньте их из шины один раз в файле, который её создаёт, и импортируйте где нужно:

```js
// bus.js
import { createBus } from "nanoeffects";
import { vuePlugin } from "nanoeffects/vue";

// createBus — шина событий, создаётся один раз вне Vue
// vuePlugin — добавляет на шину watchEmitter и useEventRef
export const bus = createBus().use(vuePlugin());
export const { watchEmitter, useEventRef } = bus; // свободные функции: они не читают `this`
```

## Сообщение шине об изменении значения

<!-- docs-check: continue -->

`watchEmitter(source, event)` следит за `ref` или геттером и отправляет `event` с новым значением. При вызове он ничего не отправляет, а при размонтировании компонента останавливается. Это `watch`, который заканчивается `emit`, поэтому действуют правила `watch`: несколько изменений за один тик дают одно событие с последним значением, а изменение объекта в `ref` на месте его не запускает.

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — событие с именем; вызов строит { type, payload }
export const queryChanged = createAction("search/queryChanged");
export const searchLoaded = createAction("search/loaded");
```

```js
// query-box.js
import { ref } from "vue";
import { watchEmitter } from "./bus";
import { queryChanged } from "./search";

export const setup = () => {
  const query = ref("");

  // watchEmitter — отправляет queryChanged(query), когда query меняется, но не при монтировании
  watchEmitter(query, queryChanged);

  return { query };
};
```

Третий аргумент принимает параметры `equals`, `traceId` и `traceGroupId`:

| Параметр | Когда использовать |
| -------- | ------------------ |
| `equals(previous, next)` | Новый объект с теми же полями не должен отправляться: `{ equals: (a, b) => a.id === b.id }`. |
| `traceId` | Нужно имя подписки в [трассировке](tracing.md#какая-подписка-начала-цепочку). |
| `traceGroupId` | Нужно назвать весь поток, который запускает эта отправка. |

`watchEmitter` возвращает функцию, которая останавливает его досрочно. Она нужна вне компонента.

## Показ результата события

<!-- docs-check: continue -->

`useEventRef(event, initial)` возвращает `ref`. Сначала в нём `initial`, затем payload каждого `event` шины. При размонтировании компонента `ref` перестаёт слушать. Если payload — функция, `ref` сохраняет её, а не вызывает.

```js
// found-list.js
import { useEventRef } from "./bus";
import { searchLoaded } from "./search";

export const setup = () => {
  // useEventRef — как ref([]), но значение устанавливает searchLoaded
  const found = useEventRef(searchLoaded, []);

  return { found };
};
```

В TypeScript тип `ref` берётся из события: для `createAction<string[]>("search/loaded")` это `Ref<string[]>`, а для события без типа payload он берётся из `initial`.

### Это не store

`useEventRef` — state одного компонента. Каждый вызывающий его компонент хранит свою копию последней payload. Шина значений не хранит, поэтому событие, пришедшее до вызова, теряется. Чтобы делить значение между компонентами или сохранить его для будущих, держите его в store, например в Pinia, и записывайте туда из обработчика события. Либо вызовите `useEventRef` один раз в корневом компоненте и передайте `ref` вниз через `provide` и `inject`.
