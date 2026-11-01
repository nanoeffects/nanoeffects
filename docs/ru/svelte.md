# nanoeffects в приложении на Svelte

> **[Уровень B](README.md#виды-проектов)**: SPA с async UI. Сначала прочитайте: [Руководство](guide.md#1-создание-шины-событий).

Задача: компонент на Svelte 5 должен показать результат события (например, найденные элементы). Для этого `sveltePlugin` даёт `eventStore`. Работающий пример — шаблон `svelte-ts` из [Проекта из шаблона](starter.md#начало-со-svelte).

Нужны Svelte 5 или новее и установленная `nanoeffects`. Не знакомы с шиной? Сначала прочитайте [Руководство](guide.md).

## Плагин на шине

**Проблема.** Компонент Svelte читает значение через `$store`, а событие шины — не store. Без помощи компонент пишет свой `readable` и `bus.on` и должен не забыть отписаться. Эти строки копируются в каждый компонент.

**Когда.** Компонент показывает payload события, например результат поиска.

`sveltePlugin()` добавляет на шину `eventStore`. Достаньте его из шины один раз в файле, который её создаёт, и импортируйте где нужно:

```js
// bus.js
import { createBus } from "nanoeffects";
import { sveltePlugin } from "nanoeffects/svelte";

// createBus — шина событий, создаётся один раз вне Svelte
// sveltePlugin — добавляет на шину eventStore
export const bus = createBus().use(sveltePlugin());
export const { eventStore } = bus; // свободная функция: она не читает `this`
```

## Показ результата события

<!-- docs-check: continue -->

`eventStore(event, initial)` возвращает store Svelte. Сначала его значение — `initial`, затем — payload каждого `event`. В компоненте `$found` читает store, а Svelte сам подписывается и отписывается. Если payload — функция, store сохраняет её, а не вызывает.

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

  // eventStore — как store из [], но значение устанавливает searchLoaded
  const found = eventStore(searchLoaded, []);
</script>

<ul>
  {#each $found as title (title)}
    <li>{title}</li>
  {/each}
</ul>
```

В TypeScript тип store берётся из события: для `createAction<string[]>("search/loaded")` это `Readable<string[]>`, а для события без типа payload он берётся из `initial`.

Чтобы отправить значение в шину, вызовите `bus.emit` из обработчика события, например `oninput`. При монтировании компонента ничего не отправляется, поэтому для этого направления функция плагина не нужна.

### Это не store приложения

Store слушает шину, только пока его кто-то читает: первый `$found` запускает прослушивание, последний останавливает. Шина значений не хранит, поэтому событие, пришедшее без читателей, теряется, а компонент, смонтированный позже, начинает с `initial`. Чтобы сохранить значение для будущих компонентов, держите его в собственном store и записывайте туда из обработчика события:

```js
// found-store.js
import { writable } from "svelte/store";
import { bus } from "./bus";
import { searchLoaded } from "./search";

// writable — store Svelte, который вы держите на всё приложение
export const foundTitles = writable([]);

// bus.on — копировать каждый searchLoaded в store, открыт компонент или нет
bus.on(searchLoaded, (titles) => foundTitles.set(titles));
```
