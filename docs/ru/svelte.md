# nanoeffects в приложении на Svelte

> **Уровень B.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Компонент на Svelte 5 показывает результат события через `eventStore`, который даёт `sveltePlugin`. Работающий пример — шаблон `svelte-ts` из [Проекта из шаблона](starter.md#начало-со-svelte).

Нужны Svelte 5 или новее и установленная `nanoeffects`. Не знакомы с шиной? Сначала прочитайте [Руководство](guide.md).

## Добавьте плагин на шину

**Проблема.** Компонент Svelte читает значение через `$store`, а событие шины — не стор. Без помощи компонент пишет свой `readable` и `bus.on` и должен не забыть отписаться. Эти строки копируются в каждый компонент.

**Когда.** Компонент показывает нагрузку события, например результат поиска.

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

## Покажите результат события

<!-- docs-check: continue -->

`eventStore(event, initial)` возвращает стор Svelte. Сначала его значение — `initial`, затем — нагрузка каждого `event`. В компоненте `$found` читает стор, а Svelte сам подписывается и отписывается. Если нагрузка — функция, стор сохраняет её, а не вызывает.

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

Стор слушает шину, только пока его кто-то читает: первый `$found` запускает прослушивание, последний останавливает. Шина значений не хранит, поэтому событие, пришедшее без читателей, теряется, а компонент, смонтированный позже, начинает с `initial`. Чтобы сохранить значение для будущих компонентов, держите его в собственном сторе и записывайте туда из обработчика события:

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
