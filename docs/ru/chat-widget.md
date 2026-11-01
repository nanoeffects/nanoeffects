# Виджет чата, который слушает только пока открыт

> **Уровень D.** Сначала прочитайте: [Руководство](guide.md#1-создайте-шину), шаги 1–3.

Чат с ботом за кнопкой-лаунчером, где закрытый чат ничего не стоит. «Закрыт» значит: нет подписок на шине, опроса, обработчика клавиатуры и запроса в полёте. Открытие включает всё это, закрытие выключает одним вызовом.

Код лежит в [`examples/chat-widget`](../../examples/chat-widget): обычный DOM и TypeScript, поддельный бот в браузере, без backend. Запустите его на [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/chat-widget) или на своей машине:

```bash
cd examples/chat-widget
npm install
npm run dev
```

Это пример уровня D: логика живёт в одном модуле, а страница его только подключает и отключает. Для приложения с несколькими фичами см. [Чат с сущностями, фичами, модулями и небольшим backend](chat-example.md).

## Что происходит при открытии и закрытии

| Момент | Что происходит |
| ------ | -------------- |
| Открытие | Модуль подключается: подписывается обработчик бота, опрашиваются сообщения оператора, добавляется обработчик `Escape`. Панель рисуется и слушает шину. |
| Пользователь отправляет текст | Тексты уходят боту по одному, в порядке отправки, с ограничением по времени и повтором. |
| `Escape` | Модуль отправляет `chat/closeRequested`; лаунчер закрывает чат. |
| Закрытие | Панель удаляется и отписывается, модуль отключается. Запрос в полёте прерывается, опрос останавливается, обработчик `Escape` исчезает. |

## Файлы

| Файл | Задача |
| ---- | ------ |
| `src/bus.ts` | Шина и `modulePlugin()` без модуля: лаунчер подключает модуль сам. |
| `src/chat.ts` | Только события: `messageSent`, `messageAdded`, `typingChanged`, `closeRequested`. |
| `src/chat-handlers.ts` | `askBot` (внутри `timeout` и `retry`) и `watchOperator` (`poll`): обычные `async`-функции, которые ничего не знают о странице. |
| `src/chat-module.ts` | Список того, что живо, пока чат открыт. |
| `src/panel.ts` | Вид: показывает строки, отправляет тексты, возвращает одну функцию, которая его удаляет. |
| `src/main.ts` | Лаунчер: единственный файл, знающий и модуль, и панель; он слушает `closeRequested`, только пока чат открыт. |

## Свяжите всё в одном модуле

Модуль — список того, что живо, пока чат открыт. При отключении шина отменяет каждую его строку.

<!-- docs-check: skip - остальные файлы примера лежат в examples/chat-widget -->
```js
// chat-module.js
import { createModule } from "nanoeffects/actions";
import { queue } from "nanoeffects/policies";
import { closeRequested, messageSent } from "./chat";
import { askBot, watchOperator } from "./chat-handlers";

// задача, которая остаётся в ожидании, пока модуль не отключится; тогда её сигнал прерывается
const untilAborted = (ctx) =>
  new Promise((resolve) => {
    ctx.signal.addEventListener("abort", resolve, { once: true });
  });

// DOM-обработчик, живущий столько же, сколько модуль: `signal` снимает его при прерывании
const listenToEscape = async (_, ctx) => {
  const onKey = (event) => {
    if (event.key === "Escape") {
      ctx.emit(closeRequested());
    }
  };
  document.addEventListener("keydown", onKey, { signal: ctx.signal });
  await untilAborted(ctx);
};

export const chatModule = createModule("chat", (module) => {
  // module.run — запускает askBot как дочернюю задачу модуля, так что отключение её прерывает
  const answer = (text) => module.run(askBot, text);
  // on + queue — отвечать на тексты один за другим, в порядке отправки
  module.on(messageSent, queue(answer));
  // spawn — фоновая задача, живущая столько же, сколько модуль
  module.spawn(watchOperator);
  module.spawn(listenToEscape);
});
```

Три детали, которые делают очистку полной:

- **`module.run`, а не `askBot` напрямую.** Обработчик из `module.on` запускается как дочерняя задача той, что отправила событие (здесь панели). Отключение прекращает слушать, но не прерывает уже идущий запрос. `module.run` делает запрос дочерним для модуля.
- **`queue`, а не `latest`.** `queue` сохраняет порядок, когда пользователь быстро отправляет два текста. [`latest`](policies.md) прервал бы первый ответ, что для разговора неверно.
- **DOM-обработчик с `signal`.** `addEventListener` принимает параметр `signal` и отписывает обработчик при прерывании. До этого задача остаётся в ожидании: завершённая задача повторно не прерывается.

## Откройте и закройте из лаунчера

`app.mount` возвращает функцию, которая отключает модуль, `bus.on` — функцию отписки. Лаунчер объединяет их и функцию, удаляющую панель, в один `close`.

<!-- docs-check: skip - остальные файлы примера лежат в examples/chat-widget -->
```js
// main.js
import { app, bus } from "./bus";
import { closeRequested } from "./chat";
import { chatModule } from "./chat-module";
import { renderPanel } from "./panel";

const button = document.querySelector("#chat-launcher");
let close = null; // задано, пока чат открыт

const open = () => {
  const stopModule = app.mount(chatModule); // стартуют подписки, опрос и Escape
  const stopPanel = renderPanel(document.body);
  // модуль отправляет closeRequested по Escape; пока чат закрыт, этого не делает никто
  const stopEscape = bus.on(closeRequested, () => close?.());
  close = () => {
    stopEscape();
    stopPanel();
    stopModule(); // всё, что запустил модуль, заканчивается, запрос в полёте тоже
    close = null;
  };
};

button.addEventListener("click", () => {
  if (close) {
    close();
  } else {
    open();
  }
});
```

Пока чат закрыт, у лаунчера нет подписок на шине. Остаётся только DOM-обработчик клика по кнопке.

## Проверка очистки

1. Откройте чат и отправьте текст. Бот отвечает примерно через секунду. Каждый третий вопрос падает, и повтор спрашивает снова.
2. Отправьте текст и закройте чат до прихода ответа. Строка не появится, в том числе когда вы снова откроете чат.
3. Посмотрите на блок «Listeners on the bus»: он показывает `bus.get(event).length` для четырёх событий и обновляется, когда чат открывается или закрывается. Закрыт: у каждого события `0`, и у «all events» тоже. Открыт: у каждого из четырёх по одной подписке, а «all events» — `4`. Так видно, что ничего не осталось подписанным.
4. Подождите 10 с при закрытом чате. Оператор не опрашивается: строка от оператора не появляется.
5. Нажмите `Escape` при закрытом чате. Ничего не происходит. Откройте чат и нажмите снова: он закрывается.
6. Снова откройте чат. Старые строки вернулись, и опрос работает.

`src/tests/chat-widget-example.test.ts` проверяет те же пункты без браузера.
