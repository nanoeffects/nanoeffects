# nanoeffects в приложении на Svelte

> **Уровень B.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Эта страница нужна, когда ваше приложение на Svelte 5 и компоненту нужно показать результат события. Для этого `sveltePlugin` даёт одну функцию, `eventStore`. Чтобы увидеть её в работающем проекте, начните с шаблона `svelte-ts` из [Проекта из шаблона](starter.md#начало-со-svelte).

Нужны Svelte 5 или новее и установленная `nanoeffects`. Если вы не знаете, что такое шина, сначала прочитайте [Руководство](guide.md).

## Добавьте плагин на шину

**Проблема.** Компонент Svelte читает значение через `$store`. Событие шины — не стор, поэтому без помощи компонент пишет свой `readable` и свой `bus.on` и должен не забыть перестать слушать. Те же несколько строк копируются в каждый компонент.

**Когда.** Компонент показывает нагрузку события, например результат поиска.

`sveltePlugin()` добавляет на шину `eventStore`. Достаньте его из шины один раз, в файле, который её создаёт, и импортируйте там, где нужно:

```js
// bus.js
import { createBus } from "nanoeffects";
import { sveltePlugin } from "nanoeffects/svelte";

// createBus — шина событий, создаётся один раз вне Svelte
// sveltePlugin — добавляет на шину eventStore
export const bus = createBus().use(sveltePlugin());
export const { eventStore } = bus; // свободная функция: она не читает `this`
```

## Покажите результат события

<!-- docs-check: continue -->

`eventStore(event, initial)` возвращает стор Svelte. Его значение сначала `initial`, а затем нагрузка каждого `event`. В компоненте `$found` читает его, а Svelte сам подписывается и отписывается. Нагрузка-функция сохраняется, а не вызывается.

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — событие с именем; вызов строит { type, payload }
export const searchLoaded = createAction("search/loaded");
```

<!-- docs-check: skip - файл .svelte -->
```svelte
<script>
  import { eventStore } from "./bus";
  import { searchLoaded } from "./search";

  // eventStore — как стор из [], но значение устанавливает searchLoaded
  const found = eventStore(searchLoaded, []);
</script>

<ul>
  {#each $found as title (title)}
    <li>{title}</li>
  {/each}
</ul>
```

В TypeScript тип стора берётся из события: для `createAction<string[]>("search/loaded")` это `Readable<string[]>`, а для события без типа нагрузки он берётся из `initial`.

Чтобы отправить значение в шину, вызовите `bus.emit` из обработчика события, например `oninput`. При монтировании компонента ничего не отправляется, поэтому для этого направления функция плагина не нужна.

### Это не стор приложения

Шина слушает только пока что-то читает стор: первый `$found` запускает её, а последний останавливает. Шина значений не хранит, поэтому событие, пришедшее, пока стор никто не читал, теряется, а компонент, смонтированный позже, начинает с `initial`. Чтобы сохранить значение для компонентов, которые появятся позже, держите его в собственном сторе и записывайте в него из обработчика события:

```js
// found-store.js
import { writable } from "svelte/store";
import { bus } from "./bus";
import { searchLoaded } from "./search";

// writable — стор Svelte, который вы держите на всё приложение
export const foundTitles = writable([]);

// bus.on — копировать каждый searchLoaded в стор, открыт компонент или нет
bus.on(searchLoaded, (titles) => foundTitles.set(titles));
```

## Куда идти дальше

- Та же задача для React: [Форма регистрации на React](react.md); для Vue: [nanoeffects в приложении на Vue](vue.md).
- Политика в компоненте (сохранение с debounce): в скрипте компонента создайте её один раз через [`withPolicy`](policies.md#политика-без-шины); Svelte запускает скрипт один раз, так что хук не нужен.
