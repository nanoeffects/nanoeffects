import { useState } from "react";
import { useEmitter, useEventState } from "./bus";
import { Notes } from "./Notes";
import { queryChanged, searchLoaded } from "./search";

export function App() {
  const [query, setQuery] = useState("");

  // useEventState — like useState, but searchLoaded sets the value; it unsubscribes on unmount
  // the JSDoc gives the state its type: the event has none, so it comes from the initial value
  const [found] = useEventState(searchLoaded, /** @type {string[]} */ ([]));

  // useEmitter — emits queryChanged after each change of query, never on mount
  useEmitter(queryChanged, query);

  return (
    <>
      <h1>Search in React with debounce and latest</h1>
      <p>
        Type fast: one request starts after 300 ms of quiet. Type again while it
        runs (each takes 800 ms): the older request is aborted.
      </p>
      <input
        value={query}
        placeholder="Type a query"
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul>
        {found.map((title) => (
          <li key={title}>{title}</li>
        ))}
      </ul>
      <Notes />
    </>
  );
}
