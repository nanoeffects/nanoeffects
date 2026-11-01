# Защита от повторной отправки

> **[Уровень B](README.md#виды-проектов)**: SPA с async UI. Сначала прочитайте: [Политики](policies.md).

Второй клик по «Оплатить», «Зарегистрироваться» или «Сохранить» отправляет запрос дважды. Как игнорировать второй клик, пока идёт первый запрос, как делать это для каждого элемента отдельно и когда лучше поставить вызовы в очередь.

## Проблема

Пользователь кликает дважды. Оба клика запускают обработчик, и backend получает два запроса.

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // шина: события и обработчики

// Без политики каждый "submitted" запускает свой запрос.
bus.on("submitted", async (form) => {
  const order = await api.pay(form);
  bus.emit("paid", order);
});
```

Кнопка `disabled` помогает только до следующего рендера. Флаг (`if (busy) return`) приходится сбрасывать на каждом пути ошибки и после прерывания.

## Игнорирование кликов, пока идёт запрос

Оберните обработчик в `leading`. Пока идёт один запуск, новые вызовы отбрасываются. Когда запуск заканчивается, следующий клик работает.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

// leading: вызов отбрасывается, пока предыдущий запуск ещё идёт
bus.on(
  "submitted",
  leading(async (form, ctx) => {
    const order = await api.pay(form, { signal: ctx.signal });
    ctx.emit("paid", order);
  }),
);
```

Что заменить: `api.pay` — ваша функция запроса.

Результат: два `emit("submitted", form)` подряд отправляют один запрос. Второй вызов сразу возвращается и ничего не делает.

`leading` снимает блокировку, когда задача завершается или прерывается. Если обработчик выбросил ошибку, следующий клик снова работает, и сбрасывать флаг не нужно.

## Один запуск на элемент

Список строк с кнопкой «Удалить» не должен блокироваться целиком. Дайте каждому элементу своё состояние через `key`.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus(); // шина: события и обработчики

// leading с key: один выполняющийся вызов на id строки, другие строки не блокируются
bus.on(
  "row/deleted",
  leading(
    async (row, ctx) => {
      await api.deleteRow(row.id, { signal: ctx.signal });
      ctx.emit("row/removed", row.id);
    },
    { key: (row) => row.id },
  ),
);
```

## Повтор только при сбое сети

Повтор неудавшегося платежа может списать деньги дважды, если backend всё же выполнил первый запрос. Повторяйте только при ошибках, когда запрос не дошёл до backend, и сделайте так, чтобы backend принимал ключ идемпотентности.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";
import { retry } from "nanoeffects/effects";

const bus = createBus(); // шина: события и обработчики

// fetch отклоняется с TypeError при сбое сети; HTTP-ошибка — обычный Error
const isNetworkError = (error) => error instanceof TypeError;

bus.on(
  "submitted",
  leading(async (form, ctx) => {
    const pay = () => api.pay(form, { signal: ctx.signal });
    // retry: до 3 попыток с паузой 500 мс, только если упала сеть
    const order = await retry(ctx, pay, { times: 3, delay: 500, shouldRetry: isNetworkError });
    ctx.emit("paid", order);
  }),
);
```

Растущая пауза между попытками: [`backoff`](effects.md#backoff).

## Защита обработчика без шины

`withPolicy` превращает политику в обычную функцию, так что обработчику клика шина не нужна.

```js
import { leading, withPolicy } from "nanoeffects/policies";

// leading: игнорировать новые вызовы, пока идёт запуск
const policy = leading(async (form, { signal }) => {
  await api.save(form, { signal });
});

// withPolicy: обычная функция, которую можно вызывать из onSubmit
const submit = withPolicy(policy);

submit({ name: "Ada" }); // выполняется
submit({ name: "Ada" }); // игнорируется, пока идёт первый; завершается значением undefined
```

В компоненте React берите [`usePolicy`](react.md#обработчик-с-debounce-между-рендерами).

Если клики терять нельзя, берите `queue`, если нужен только новейший — `latest`: [Политики](policies.md).
