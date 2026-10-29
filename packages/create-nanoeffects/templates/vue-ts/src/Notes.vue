<script setup lang="ts">
import { debounce, withPolicy } from "nanoeffects/policies";
import { onScopeDispose, ref, watch } from "vue";

// A component that needs a policy but no bus: save a note 1 s after the last key.
const text = ref("");
const message = ref("");

// withPolicy — a plain function that keeps the state of the policy between calls.
// <script setup> runs once per component, so it is made once; React needs a hook for this
// because a component function runs again on every render.
// debounce — wait 1 s of quiet, then run the callback
const save = withPolicy(
  debounce(1000, async (value: string) => {
    message.value = `Saved ${value.length} characters`;
  }),
);

watch(text, (value) => save(value));

// cancel — drop a save that is still waiting when the component is unmounted
onScopeDispose(() => save.cancel());
</script>

<template>
  <h2>Notes</h2>
  <textarea v-model="text" placeholder="Saved 1 s after you stop typing" />
  <p>{{ message }}</p>
</template>
