<script lang="ts">
  import { debounce, withPolicy } from "nanoeffects/policies";
  import { onDestroy } from "svelte";

  // A component that needs a policy but no bus: save a note 1 s after the last key.
  let message = $state("");

  // withPolicy — a plain function that keeps the state of the policy between calls.
  // This script runs once per component, so it is made once; React needs a hook for this
  // because a component function runs again on every render.
  // debounce — wait 1 s of quiet, then run the callback
  const save = withPolicy(
    debounce(1000, async (text: string) => {
      message = `Saved ${text.length} characters`;
    }),
  );

  // cancel — drop a save that is still waiting when the component is destroyed
  onDestroy(() => save.cancel());
</script>

<h2>Notes</h2>
<textarea
  placeholder="Saved 1 s after you stop typing"
  oninput={(event) => save(event.currentTarget.value)}
></textarea>
<p>{message}</p>
