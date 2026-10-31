# Что стабильно

> **Уровень F.** Сначала прочитайте: [Точки входа пакета](package.md).

Эта страница помогает решить, на что можно полагаться. Она говорит, какие импорты стабильны, что считается ломающим изменением, какие версии поддерживаются и какие формы вызова остаются.

## Какие точки входа стабильны

Стабильная точка входа подчиняется правилам ниже. Нестабильная может измениться в любом минорном релизе; каждое изменение записывается в [CHANGELOG](../../CHANGELOG.md), и никакого периода устаревания заранее не обещается.

| Импорт | Статус | Примечание |
| ------ | ------ | ---------- |
| `nanoeffects` | Стабильно | `createBus` и типы шины |
| `nanoeffects/effects` | Стабильно | `retry`, `timeout`, `poll`, `take`, `delay`, `all`, `allSettled`, `race`, `backoff`, `cancellable`, `effectsPlugin` |
| `nanoeffects/policies` | Стабильно | `latest`, `leading`, `debounce`, `throttle`, `queue`, `withPolicy` |
| `nanoeffects/actions` | Стабильно | `createAction`, `createJob`, `createModule` и их плагины |
| `nanoeffects/trace` | Стабильно: контракт | `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase`, `EffectName` и `tracePlugin` |
| `nanoeffects/trace` | Нестабильно: инструменты | `createTracer`, `consoleLogger`, `performanceLogger`, `createTraceRecorder`, `reduxDevtools` и их типы параметров |
| `nanoeffects/scope` | Нестабильно | `scopePlugin`, `effect` |
| `nanoeffects/match` | Нестабильно | `matchPlugin` |
| `nanoeffects/signal` | Нестабильно | `signalPlugin`, `fromSignal` |
| `nanoeffects/context` | Нестабильно | `contextPlugin` |
| `nanoeffects/oop` | Нестабильно | `Emitter`, `extendBus`, `On`, `Once`, `WithBus`, `disposeBus` |
| `nanoeffects/observable` | Нестабильно | `createObserve`, `Subject`, `events` |
| `nanoeffects/redux` | Нестабильно | `createEffectsMiddleware` |
| `nanoeffects/react` | Нестабильно | `reactPlugin`, `usePolicy` |
| `nanoeffects/svelte` | Нестабильно | `sveltePlugin` |
| `nanoeffects/vue` | Нестабильно | `vuePlugin` |
| `nanoeffects/dev` | Нестабильно | `devPlugin` |

Адаптеры (`react`, `vue`, `svelte`, `redux`) нестабильны, потому что следуют API других библиотек и пока мало использовались. Они могут стать стабильными, после того как библиотека какое-то время побудет в использовании.

## Что считается ломающим изменением

Для стабильной точки входа ломающими считаются такие изменения:

- Изменение того, что вызов делает во время выполнения.
- Изменение типа, из-за которого код, раньше компилировавшийся, перестаёт компилироваться.
- Удалённый или переименованный экспорт.

Более строгий тип, который лишь находит ошибки в коде, и так уже неверном, ломающим не считается. Он выходит в минорном релизе с заметкой в CHANGELOG.

Обещание не покрывает:

- Любую нестабильную точку входа.
- Текст сообщений `nanoeffects/dev`.
- Детали нагрузки событий трассировки. Форма события (`id`, `parentId`, `rootId`, `type`, `effect`, `phase`) покрыта; содержимое `payload` — нет.

До версии 1.0.0 ломающее изменение выходит в минорном релизе в разделе `### Breaking` в CHANGELOG. Начиная с 1.0.0 оно выходит только в мажорном релизе.

Устаревший экспорт продолжает работать и удаляется только в мажорном релизе. `RaceStarter` устарел: используйте вместо него `StarterOf`.

## Проверьте поддерживаемые версии

| Что | Поддерживается |
| --- | -------------- |
| Node.js, библиотека | 18, 20, 22 и 24 (smoke-тест запускает собранный пакет на каждой) |
| Node.js, инструменты разработки и трассировка в браузере | 22 и новее |
| TypeScript | 5.9 и 7. Собранные файлы объявлений типов проверяются TypeScript 5.9 в CI, а исходники — TypeScript 7. Более старые версии не тестируются. |
| React | 18 или новее (`nanoeffects/react`) |
| Vue | 3.3 или новее (`nanoeffects/vue`) |
| Svelte | 5 или новее (`nanoeffects/svelte`) |

У библиотеки нет зависимостей. React, Vue и Svelte — необязательные peer-зависимости только своих точек входа.

## Полагайтесь на эти формы вызова

У `retry`, `timeout` и `poll` три формы вызова, и все три остаются:

```js
import { createBus } from "nanoeffects";
import { race, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  // с ctx: вы передаёте контекст, а функция берёт из него сигнал
  const user = await retry(ctx, () => fetchUser(id, { signal: ctx.signal }), { times: 3 });

  // как стартер: группа (race, all, allSettled, timeout) вызывает его со своим child
  const result = await race(ctx, {
    user: retry((_, { signal }) => fetchUser(id, { signal }), { times: 3 }),
  });
});

// как задача (Task): функция (payload, ctx), которую вызывают bus.on и ctx.run
bus.on("reload", retry((id, { signal }) => fetchUser(id, { signal }), { times: 3 }));
```

Формы различаются по аргументам: контекст первым — это форма с `ctx`; функция, вызванная с нагрузкой и контекстом, — это задача (Task); та же функция, вызванная группой с одним аргументом, своим child, — это стартер. Это правило — часть контракта и не зависит от того, сколько параметров объявляет ваша функция.

`all` и `allSettled` принимают параметры только в форме с `ctx`, `all(ctx, effects, { concurrency })`. У формы без `ctx` один аргумент, поэтому второй выглядел бы как форма с `ctx`. У `race` нет `concurrency`: он заканчивается на первом результате, так что стартер, ждавший свободный слот, никогда бы не запустился. См. [Эффекты](effects.md#запуск-нескольких-стартеров-вместе).
