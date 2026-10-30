<script lang="ts">
  import { bus, eventStore } from "./bus";
  import Notes from "./Notes.svelte";
  import { queryChanged, searchLoaded } from "./search";

  // eventStore — like a store of [], but searchLoaded sets the value; Svelte stops listening
  // when this component is destroyed. found is a store of string[]: the type comes from
  // createAction<string[]> in search.ts.
  //
  // WARNING: this is not a store of the app. It listens to the bus only while something reads it
  // (the first $found starts it, the last one stops it), and the bus keeps no values, so an event
  // that came while nothing read the store is lost. To keep a value for components that come
  // later, keep it in a store of your own and write to it from a handler of the event.
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
