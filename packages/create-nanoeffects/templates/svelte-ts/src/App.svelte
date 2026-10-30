<script lang="ts">
  import { bus } from "./bus";
  import { eventStore } from "./event-store";
  import Notes from "./Notes.svelte";
  import { queryChanged, searchLoaded } from "./search";

  // eventStore — like a store of [], but searchLoaded sets the value; Svelte stops listening
  // when this component is destroyed. found is a store of string[]: the type comes from
  // createAction<string[]> in search.ts. It is not a store of the app: see event-store.ts.
  const found = eventStore(searchLoaded, []);
</script>

<h1>Search in Svelte with debounce and latest</h1>
<p>
  Type fast: one request starts after 300 ms of quiet. Type again while it runs (each takes 800
  ms): the older request is aborted.
</p>
<!-- bus.emit — tell the bus the query changed; it runs on input, so nothing is emitted on mount -->
<input
  placeholder="Type a query"
  autocomplete="off"
  oninput={(event) => bus.emit(queryChanged(event.currentTarget.value))}
/>
<ul>
  {#each $found as title (title)}
    <li>{title}</li>
  {/each}
</ul>
<Notes />
