import { useState } from "react";
import { useEmitter, useEventState } from "./bus";
import { Notes } from "./Notes";
import { queryChanged, searchLoaded } from "./search";

export function App() {
  const [query, setQuery] = useState("");

  // useEventState — like useState, but searchLoaded sets the value; it unsubscribes on unmount
  // WARNING: this is state of this component, not a global store. A second component gets its
  // own copy, and an event that came before this component mounted is lost: the bus keeps no values.
  // To share a value, call useEventState once in a Context provider at the root, or keep it in
  // a state manager (Redux, Zustand, Jotai...) and write to it from a handler.
  // found is string[]: the type comes from createAction<string[]> in search.ts
  const [found] = useEventState(searchLoaded, []);

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
