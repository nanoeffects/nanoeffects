# Шина в классе

> **[Уровень D](README.md#виды-проектов)**: доменная логика вне UI. Сначала прочитайте: [Руководство](guide.md#1-создание-шины-событий).

**Доменная логика живёт в классах**: в сервисе, сторе или контроллере, которым нужна шина внутри методов. Есть два способа дать классу методы шины. Оба запоминают подписки каждого экземпляра, поэтому `dispose()` завершает их все:

| Что нужно | Использовать |
| --------- | ------------ |
| чтобы каждый `new Service()` был независимым эмиттером | `extends Emitter` |
| чтобы экземпляры делили шину или использовали плагины | `extends extendBus(bus)` |

Если ваша логика — обычные функции, оставайтесь с [модулями](actions.md#модули): модуль — та же идея без класса.

## На этой странице

- [Проблема без этого](#проблема-без-этого)
- [Независимый эмиттер через `Emitter`](#независимый-эмиттер-через-emitter)
  - [Типы событий](#типы-событий)
- [Методы общей шины в классе](#методы-общей-шины-в-классе)
  - [Расширение результата без собственного класса](#расширение-результата-без-собственного-класса)
- [Собственная шина класса](#собственная-шина-класса)
- [Завершение подписок через `dispose`](#завершение-подписок-через-dispose)
- [Событие как поток через `Subject`](#событие-как-поток-через-subject)
- [Собственный метод](#собственный-метод)
- [Подписка метода через `@On` и `@Once`](#подписка-метода-через-on-и-once)
- [Декоратор класса `@WithBus`](#декоратор-класса-withbus)
- [Метод, переданный вручную](#метод-переданный-вручную)
- [Типы экземпляров](#типы-экземпляров)
- [Что не сделано](#что-не-сделано)

## Проблема без этого

Класс, который слушает шину, держит ссылку на неё и хранит все функции отписки в списке, чтобы вызвать их, когда объект уходит. Забудете одну — и старый объект продолжает обрабатывать события. `extendBus` делает и то и другое за вас.

## Независимый эмиттер через `Emitter`

`Emitter` — базовый класс. У каждого экземпляра класса, который его расширяет, своя шина: события одного экземпляра никогда не доходят до другого. Это форма `EventEmitter` из Node.

```js
// video-service.js
import { Emitter } from "nanoeffects/oop";

// Emitter — базовый класс: каждый new VideoService() получает on, once, off, emit, dispose и свою шину
export class VideoService extends Emitter {
  constructor() {
    super();
    // this.on — подписка этого экземпляра; dispose() её снимает
    this.on("played", () => console.log("playing"));
  }
}
```

```js
import { VideoService } from "./video-service";

const first = new VideoService();
const second = new VideoService();
first.on("paused", () => console.log("first paused"));
second.emit("paused"); // ничего: экземпляры не делят шину
first.emit("paused"); // выводит "first paused"
first.dispose(); // его подписки сняты
```

Что вы получаете:

- `on`, `once`, `off`, `emit`, `dispose` и `bus` (шина этого экземпляра). `instance[Symbol.dispose]()` делает то же, что `dispose()`, так что `using video = new VideoService()` работает там, где среда выполнения это поддерживает.
- `@On` и `@Once` работают на его методах (см. ниже). Подписки делаются, когда выполняется конструктор базового класса, то есть раньше полей вашего подкласса.
- `on`, `once`, `off` и `emit` привязаны к экземпляру, так что `const { emit } = video` работает. Подкласс заменяет один из них свойством-стрелкой (`emit = (…) => …`); TypeScript не позволяет переобъявить его методом. `dispose` — метод, и его можно переопределить как обычно.
- Методов плагинов нет: шина создаётся внутри, поэтому плагинов на ней нет. Для плагинов или для шины, которую делят несколько экземпляров или классов, используйте `extendBus` (следующие разделы).
- Для потока одного события см. [`Subject`](observable.md#чтение-и-запись-одного-события-через-subject) и [Событие как поток через `Subject`](#событие-как-поток-через-subject).

### Типы событий

`Emitter` принимает события класса как параметр типа.

```ts
// video-service.ts
import { Emitter } from "nanoeffects/oop";

// VideoEvents — только для проверки типов: payload каждого события этого класса
type VideoEvents = { "video/time": number; "video/paused": void };

export class VideoService extends Emitter<VideoEvents> {
  constructor() {
    super();
    // seconds — число, потому что "video/time" несёт число
    this.on("video/time", (seconds) => console.log(seconds));
  }
}

const video = new VideoService();
video.emit("video/time", 12); // проверяется по VideoEvents
video.emit("video/paused"); // без payload
```

## Методы общей шины в классе

`extendBus(bus, Base)` возвращает подкласс `Base`. У его экземпляров есть методы шины, а аргументы `new` идут в конструктор `Base`.

```js
// bus.js
import { createBus } from "nanoeffects";

// createBus — шина, которую делят сервисы приложения
export const bus = createBus();
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — события домена поиска
export const queryChanged = createAction("search/query-changed");
export const resultsLoaded = createAction("search/results-loaded");
```

```js
// search-service.js
import { extendBus } from "nanoeffects/oop";
import { bus } from "./bus";
import { queryChanged, resultsLoaded } from "./search";

class SearchServiceBase {
  constructor(api) {
    this.api = api;
    // this.on — подписка этого экземпляра; dispose() её снимает
    this.on(queryChanged, (query, ctx) => this.search(query, ctx)); // стрелка сохраняет this
  }

  async search(query, { signal, emit }) {
    const items = await this.api.search(query, { signal });
    emit(resultsLoaded(items));
  }
}

// extendBus — подкласс, у экземпляров которого есть on, once, off, emit и dispose
export const SearchService = extendBus(bus, SearchServiceBase);
```

```js
import { queryChanged } from "./search";
import { SearchService } from "./search-service";

const service = new SearchService(api); // аргументы идут в SearchServiceBase
service.emit(queryChanged("nano")); // та же шина, что и bus.emit
service.dispose(); // его подписки сняты
```

Что вы получаете:

- Класс сохраняет имя `Base`, а его экземпляры — экземпляры `Base`.
- `on`, `once`, `off` и `emit` действуют на шину. Их можно деструктурировать: `const { emit } = service`.
- Остальные методы шины, например `emitter` из [`emitterPlugin`](plugins.md), тоже есть. Считаются только плагины, подключённые **до** `extendBus`: имена берутся при его запуске.
- `bus` — это шина, а `Class.bus` — та же самая.
- `this.on` работает в конструкторе `Base`. Методы находятся на прототипе подкласса, который уже является прототипом экземпляра.

### Расширение результата без собственного класса

`extendBus(bus)` без класса возвращает класс с методами этой шины и больше ничем. Расширяйте его как есть.

```js
// service.js
import { createBus } from "nanoeffects";
import { extendBus } from "nanoeffects/oop";

const bus = createBus(); // шина, которую делят сервисы

// extendBus(bus) — класс с on, once, off, emit и dispose поверх этой шины
export class AudioService extends extendBus(bus) {
  constructor() {
    super();
    this.on("muted", () => console.log("muted")); // заканчивается через dispose()
  }
}

const audio = new AudioService();
bus.emit("muted"); // экземпляры делят эту шину: выводит "muted"
audio.dispose();
```

## Собственная шина класса

Опустите шину, и класс получит свою, общую для всех его экземпляров. Это одна шина на класс; `Emitter` делает по одной на экземпляр.

```js
// notifier.js
import { extendBus } from "nanoeffects/oop";

class NotifierBase {}

// extendBus без шины — новая шина для этого класса; у двух классов две шины
export const Notifier = extendBus(NotifierBase);

const first = new Notifier();
const second = new Notifier();
second.on("notified", (message) => console.log(message));
first.emit("notified", "hello"); // экземпляры делят Notifier.bus
```

Передавайте шину, когда нужны плагины (`contextPlugin`, `scopePlugin`) или когда несколько классов общаются друг с другом.

## Завершение подписок через `dispose`

`dispose()` снимает каждую подписку, сделанную через `this.on` и `this.once` этого экземпляра, и больше ничего. Его безопасно вызывать дважды. `instance[Symbol.dispose]()` делает то же, так что `using service = new SearchService(api)` работает там, где среда выполнения это поддерживает.

```js
// dispose.js
import { createBus } from "nanoeffects";
import { extendBus } from "nanoeffects/oop";

const bus = createBus();
const Service = extendBus(bus, class {});

const service = new Service();
const stop = service.on("ping", () => console.log("service heard it"));
bus.on("ping", () => console.log("the bus heard it")); // не подписка сервиса

service.dispose();
bus.emit("ping"); // только "the bus heard it"
stop(); // функция, которую вернул on, всё ещё работает и теперь ничего не делает
```

Подписка, которую вы сняли сами (функция, которую вернул `on`, `this.off` или сработавший `once`), забывается, так что экземпляр ничего для неё не держит.

## Событие как поток через `Subject`

Проблема: сервис отдаёт одно из своих событий коду для потоков, и подписка потока должна заканчиваться вместе с сервисом. `createObserve(this.bus)` так не сможет: он подписывается через шину, поэтому `dispose()` о нём не знает.

Передайте `this` в `Subject` как источник. Subject подписывается через `this.on`, так что подписка принадлежит экземпляру ([Чтение и запись одного события через Subject](observable.md#чтение-и-запись-одного-события-через-subject)).

```js
// typing.js
import { createBus } from "nanoeffects";
import { Subject } from "nanoeffects/observable";
import { extendBus } from "nanoeffects/oop";

const bus = createBus(); // шина: события и обработчики

class TypingBase {
  constructor() {
    this.typed = new Subject(this, "typed"); // Subject — событие "typed" как поток; this — источник
    this.typed.subscribe((text) => console.log(text));
  }
}

const Typing = extendBus(bus, TypingBase); // extendBus — класс с on, emit и dispose

const typing = new Typing();
typing.typed.next("a"); // выводит "a"
typing.dispose(); // завершает и подписку Subject
typing.typed.next("b"); // ничего не выводится
```

В TypeScript объявите `on` и `emit` в классе (`declare on: BusMethods<typeof bus>["on"]`, см. [Типизируйте экземпляры](#типы-экземпляров)), чтобы `this` подходил как источник.

## Собственный метод

Класс выигрывает любой конфликт имён. Если у `Base` есть `emit`, `dispose`, `on` или `bus`, ваш остаётся, а метод шины не добавляется. `Base` со своим `dispose` никогда не завершил бы подписки, поэтому вызывайте оттуда `disposeBus(this)`.

```js
// cache.js
import { createBus } from "nanoeffects";
import { disposeBus, extendBus } from "nanoeffects/oop";

const bus = createBus();

class CacheBase {
  dispose() {
    this.items.clear(); // ваша собственная очистка
    disposeBus(this); // disposeBus — завершает подписки этого экземпляра
  }

  items = new Map();
}

export const Cache = extendBus(bus, CacheBase);
```

`disposeBus` ничего не делает для значения, которое не является экземпляром такого класса.

## Подписка метода через `@On` и `@Once`

`On` здесь — декоратор. Главная точка входа тоже экспортирует тип `On` — тип `bus.on`. Это разные вещи из разных импортов. Если файлу нужны оба, переименуйте один: `import { On as OnDecorator } from "nanoeffects/oop"`.

Декоратор превращает метод в обработчик события для каждого экземпляра, с привязанным `this`. Вам не нужно писать `this.on` в конструкторе, а `dispose()` завершает и эту подписку.

Шина и события те же, что выше, на TypeScript:

```ts
// bus.ts
import { createBus } from "nanoeffects";

export const bus = createBus();
```

```ts
// search.ts
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction<string>("search/query-changed");
export const resultsLoaded = createAction<string[]>("search/results-loaded");
```

```ts
// search-service.ts
import { latest } from "nanoeffects/policies";
import { extendBus, On, Once } from "nanoeffects/oop";
import { bus } from "./bus";
import { queryChanged, resultsLoaded } from "./search";

class SearchServiceBase {
  // On — этот метод обрабатывает queryChanged для каждого экземпляра, this — экземпляр;
  // latest — каждый новый запрос прерывает предыдущий
  @On(queryChanged, latest)
  async search(query: string, { signal, emit }: { signal: AbortSignal; emit: (event: unknown) => void }) {
    const items = await api.search(query, { signal });
    emit(resultsLoaded(items));
  }

  // Once — срабатывает только на первое событие
  @Once("search/ready")
  ready() {
    console.log("first ready");
  }
}

export const SearchService = extendBus(bus, SearchServiceBase);
```

Что нужно знать:

- Событие — это имя или action creator, как для `bus.on`. Для action creator payload метода проверяется по нему.
- Второй аргумент, `wrap`, принимает привязанный обработчик и возвращает тот, на который подписываются: `latest` или `(handler) => debounce(300, handler)`. Для политики это необходимо: `latest(this.search)` оборачивает функцию без `this`, а `wrap` получает уже привязанный обработчик.
- Подписки делаются сразу после конструктора `Base`. Событие, отправленное внутри этого конструктора, до них не доходит.
- Подкласс наследует их. Метод, который подкласс переопределяет, подписывается, только если переопределение тоже декорировано.
- На классе, который сделал не `extendBus`, декоратор ничего не делает.
- Работают и декораторы языка, и `experimentalDecorators`. Ваш компилятор должен поддерживать тот, что вы используете: TypeScript 5 или новее для первого и параметр `experimentalDecorators` для второго.

Назовите метод для [трассировки](tracing.md#имя-обработчика) через `{ traceId }`, вторым аргументом или, после обёртки, третьим: `@On(queryChanged, { traceId: "searcher" })` или `@On(queryChanged, latest, { traceId: "searcher" })`. Для этого нужен `tracePlugin` на шине, а без него параметр игнорируется.

## Декоратор класса `@WithBus`

`@WithBus(bus)` делает то, что `extendBus(bus, Base)`, как декоратор класса. `@WithBus()` создаёт шину для класса.

<!-- docs-check: continue -->

```ts
// search-service.ts
import { type BusMethods, On, WithBus } from "nanoeffects/oop";
import { bus } from "./bus";
import { queryChanged } from "./search";

// TypeScript не меняет тип декорированного класса, поэтому скажите, что он получает;
// только для проверки типов: во время выполнения WithBus уже добавляет методы
interface SearchService extends BusMethods<typeof bus> {}

// WithBus — заменяет класс на extendBus(bus, SearchService)
@WithBus(bus)
class SearchService {
  @On(queryChanged)
  search(query: string) {
    console.log(query);
  }
}

export { SearchService };
```

Когда можно, предпочитайте `extendBus(bus, Base)`: его типы берутся из вызова и `interface` не требуют.

## Метод, переданный вручную

Обработчик, переданный в `this.on`, вызывается так, как вызывает шина, без `this`. Метод, переданный «голым», теряет `this`, как в обычном JavaScript:

```js
// handlers.js
import { createBus } from "nanoeffects";
import { extendBus } from "nanoeffects/oop";

class BaseWithHandler {
  name = "handler";

  handle() {
    console.log(this?.name);
  }

  listen() {
    this.on("ping", this.handle); // this потерян: выведет undefined
    this.on("ping", () => this.handle()); // стрелка его сохраняет
  }
}

export const Listener = extendBus(createBus(), BaseWithHandler);
```

Используйте стрелку или декорированный метод. Библиотека не привязывает `this` за вас: политика вроде `latest(this.handle)` оборачивает функцию, так что привязка работала бы в половине случаев.

## Типы экземпляров

`extendBus` возвращает класс, который принимает аргументы `Base`, а его экземпляры — это `Base` плюс `BusMethods<typeof bus>`: функциональные члены шины (`on`, `emit` и члены ранее подключённых плагинов) с `dispose` и `bus`. Член `Base` с тем же именем сохраняет свой тип.

```ts
// service.ts
import { createBus } from "nanoeffects";
import { extendBus } from "nanoeffects/oop";

type Events = { "order/placed": { id: string } };

// Events — только для проверки типов: payload шины
const bus = createBus<Events>();

class OrderServiceBase {
  name: string;

  constructor(name: string) {
    this.name = name;
  }
}

export const OrderService = extendBus(bus, OrderServiceBase);

const service = new OrderService("main"); // конструктор OrderServiceBase
service.emit("order/placed", { id: "o1" }); // проверяется по Events
```

## Что не сделано

- `this` не привязывается в обработчике, который вы передаёте вручную (см. выше).
- Методов плагина, подключённого после `extendBus`, на классе нет. Сначала подключите плагины, затем `extendBus`.
- У `Emitter` нет методов плагинов, потому что его шина создаётся внутри. Для них используйте `extendBus(bus)`.
- Подмешивание методов в существующий объект и декораторы полей или параметров в эту точку входа не входят.
