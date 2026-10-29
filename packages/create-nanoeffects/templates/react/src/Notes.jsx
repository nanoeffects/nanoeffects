import { useState } from "react";
import { debounce } from "nanoeffects/policies";
import { usePolicy } from "nanoeffects/react";

// A component that needs a policy but no bus: save a note 1 s after the last key.
export function Notes() {
  const [message, setMessage] = useState("");

  // usePolicy — one stable function between renders; the first argument is the callback
  // of the latest render, and it is cancelled when the component unmounts
  const save = usePolicy(
    async (text) => {
      setMessage(`Saved ${text.length} characters`);
    },
    // debounce — built once; task runs the callback above
    (task) => debounce(1000, task),
    [],
  );

  return (
    <>
      <h2>Notes</h2>
      <textarea
        placeholder="Saved 1 s after you stop typing"
        onChange={(event) => save(event.target.value)}
      />
      <p>{message}</p>
    </>
  );
}
