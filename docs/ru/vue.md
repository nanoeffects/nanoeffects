# nanoeffects в приложении на Vue

> **Уровень B.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Эта страница нужна, когда ваше приложение на Vue 3 и компоненту нужно общаться с шиной: сообщить ей, что значение изменилось, и показать результат события. Для этого `vuePlugin` даёт две функции. Чтобы увидеть их в работающем проекте, начните с шаблона `vue-ts` из [Проекта из шаблона](starter.md#начало-с-vue).

Нужны Vue 3.3 или новее и установленная `nanoeffects`. Если вы не знаете, что такое шина, сначала прочитайте [Руководство](guide.md).

## Добавьте плагин на шину

**Проблема.** Без помощи компонент пишет `watch(query, (value) => bus.emit(queryChanged(value)))` и собственную подписку в `onMounted` и `onUnmounted`. Те же несколько строк копируются в каждый компонент, и в каждой копии что-нибудь забыто: очистка, проверка равенства или имя подписки в трассировке.

**Когда.** Компонент Vue отправляет значения в шину, читает из неё события или делает и то и другое.

`vuePlugin()` добавляет на шину две функции. Достаньте их из шины один раз, в файле, который её создаёт, и импортируйте там, где нужно:

```js
// bus.js
import { createBus } from "nanoeffects";
import { vuePlugin } from "nanoeffects/vue";

// createBus — шина событий, создаётся один раз вне Vue
// vuePlugin — добавляет на шину watchEmitter и useEventRef
export const bus = createBus().use(vuePlugin());
export const { watchEmitter, useEventRef } = bus; // свободные функции: они не читают `this`
```

## Сообщите шине, что значение изменилось

<!-- docs-check: continue -->

`watchEmitter(source, event)` следит за `ref` или геттером и отправляет `event` с новым значением после его изменения. Он ничего не отправляет при вызове и останавливается, когда компонент размонтируется. Это `watch`, который заканчивается `emit`, поэтому он подчиняется правилам `watch`: несколько изменений за один тик отправляют одно событие с последним значением, а `ref`, в котором лежит объект, изменяемый на месте, его не запускает.

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
| `traceId` | Вы хотите, чтобы у подписки было имя в [трассировке](tracing.md#покажите-какая-подписка-начала-цепочку). |
| `traceGroupId` | Вы хотите назвать весь поток, который запускает эта отправка. |

`watchEmitter` возвращает функцию, которая останавливает его раньше времени, для использования вне компонента.

## Покажите результат события

<!-- docs-check: continue -->

`useEventRef(event, initial)` возвращает `ref`, который начинается с `initial` и который каждое `event` шины устанавливает в свою нагрузку. Он перестаёт слушать, когда компонент размонтируется. Нагрузка-функция сохраняется, а не вызывается.

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

В TypeScript тип `ref` берётся из события: для `createAction<string[]>("search/loaded")` это `Ref<string[]>`, а для события без типа нагрузки он берётся из `initial`.

### Это не стор

`useEventRef` — состояние одного компонента. Каждый компонент, который его вызывает, хранит свою копию последней нагрузки, а шина значений не хранит, поэтому событие, пришедшее до вызова, теряется. Чтобы разделить значение между компонентами или сохранить его для компонентов, которые смонтируются позже, держите его в сторе, например в Pinia, и записывайте в него из обработчика события. Либо вызовите `useEventRef` один раз в компоненте в корне и передайте `ref` вниз через `provide` и `inject`.

## Куда идти дальше

- Те же две задачи для React: [Форма регистрации на React](react.md).
- Политика в компоненте (сохранение с debounce): в `<script setup>` создайте её один раз через [`withPolicy`](policies.md#политика-без-шины); Vue запускает setup один раз, так что хук не нужен.
- Значения в Pinia: [Подключение Redux, Zustand, MobX и Pinia](stores.md).
