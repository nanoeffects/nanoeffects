<script setup lang="ts">
import { ref, watch } from "vue";
import { bus } from "./bus";
import Notes from "./Notes.vue";
import { queryChanged, searchLoaded } from "./search";
import { useEventRef } from "./use-event-ref";

const query = ref("");

// useEventRef — like ref([]), but searchLoaded sets the value; it stops listening on unmount.
// found is string[]: the type comes from createAction<string[]> in search.ts
const found = useEventRef(searchLoaded, []);

// watch runs when query changes, not on mount, so nothing is emitted until the user types.
// bus.emit — tell the bus the query changed; the handler debounces and searches
watch(query, (value) => bus.emit(queryChanged(value)));
</script>

<template>
  <h1>Search in Vue with debounce and latest</h1>
  <p>
    Type fast: one request starts after 300 ms of quiet. Type again while it runs (each takes 800
    ms): the older request is aborted.
  </p>
  <input v-model="query" placeholder="Type a query" autocomplete="off" />
  <ul>
    <li v-for="title in found" :key="title">{{ title }}</li>
  </ul>
  <Notes />
</template>
