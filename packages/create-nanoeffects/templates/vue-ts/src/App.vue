<script setup lang="ts">
import { ref } from "vue";
import { useEventRef, watchEmitter } from "./bus";
import Notes from "./Notes.vue";
import { queryChanged, searchLoaded } from "./search";

const query = ref("");

// watchEmitter — emits queryChanged(query) when query changes, never on mount
watchEmitter(query, queryChanged);

// useEventRef — like ref([]), but searchLoaded sets the value; it stops listening on unmount
// WARNING: this is state of this component, not a global store. A second component gets its
// own copy, and an event that came before this component was made is lost: the bus keeps no values.
// To share a value, keep it in a store (for example Pinia) and write to it from a handler of the
// event, or call useEventRef once in a component at the root and pass the ref down with provide/inject.
// found is string[]: the type comes from createAction<string[]> in search.ts
const found = useEventRef(searchLoaded, []);
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
