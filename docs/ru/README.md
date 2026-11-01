# Документация

nanoeffects выносит бизнес-логику и побочные эффекты из компонентов в обычные `async`-функции. Политики (`latest`, `debounce`, `queue`) и эффекты (`retry`, `timeout`, `poll`) решают гонки, повторы и отмену запросов.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus(); // шина событий

// Логика поиска живёт вне компонента; latest прерывает предыдущий запрос
bus.on(
  "search",
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal });
    bus.emit("found", items);
  }),
);

// Компонент только слушает результат и отправляет события
bus.on("found", (items) => render(items));
bus.emit("search", "nano");
```

Тот же пример с UI-фреймворком: [React](react.md), [Vue](vue.md), [Svelte](svelte.md). Готовые проекты: [Проект из шаблона](starter.md).

## Установка

```bash
npm install nanoeffects
```

Новый проект из шаблона ([Проект из шаблона](starter.md)):

```bash
npm create nanoeffects@latest my-app
```

## С чего начать

1. Пройдите [Руководство](guide.md#1-создание-шины-событий): от первой шины до модулей.
2. Типичные задачи async UI (устаревшие ответы, двойные клики, повторы запросов) разобраны в [Типовых задачах](recipes.md).

## Виды проектов

| Уровень | Проект | Читать |
| ------- | ------ | ------ |
| **A** | Небольшое приложение, виджет или MVP | [Руководство](guide.md#1-создание-шины-событий) |
| **B** | SPA с async UI: поиск, отправка сообщений, размонтирование компонентов | [Политики](policies.md), [Руководство](guide.md#3-прерывание-предыдущих-запусков) |
| **C** | Сложная бизнес-логика | [Эффекты](effects.md), [Руководство](guide.md#5-retry-и-timeout) |
| **D** | Доменная логика вне UI | [Actions, jobs и модули](actions.md), [Руководство](guide.md#7-способы-отправки-событий) |
| **E** | Готовое приложение на Redux, Zustand, MobX или Pinia, либо библиотека данных | [State managers](stores.md), [Библиотеки запросов](query-libraries.md) |
| **F** | Платформа, SDK или долгоживущее приложение | [Трассировка](tracing.md), [Hot reload](hmr.md), [Семантика](semantics.md) |

## Справочник

- [Точки входа пакета](package.md)
- [Плагины](plugins.md): что даёт каждый плагин шины и в каком порядке их подключать
- [Семантика](semantics.md): точные правила `emit`, отмены и порядка
- [Трассировка](tracing.md): логгеры, Redux DevTools, `notrace`
- [Observable](observable.md): события как Observable стандарта TC39
- [Hot reload и диагностика при разработке](hmr.md)
