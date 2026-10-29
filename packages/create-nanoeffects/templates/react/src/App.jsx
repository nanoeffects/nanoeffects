import { useEffect, useState } from "react";
import { bus, useEmitter } from "./bus";
import { Notes } from "./Notes";
import { queryChanged, searchLoaded } from "./search";

export function App() {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState([]);

  // useEmitter — emits queryChanged after each change of query, never on mount
  useEmitter(queryChanged, query);

  // bus.on returns the function that unsubscribes; returning it from the effect cleans up on unmount
  useEffect(() => bus.on(searchLoaded, setFound), []);

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
