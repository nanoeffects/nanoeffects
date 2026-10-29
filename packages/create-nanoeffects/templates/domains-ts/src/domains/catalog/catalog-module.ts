import { createModule } from "nanoeffects/actions";
import { answerFind, search } from "./catalog-handlers";
import { findProducts, searchRequested } from "./catalog";

// createModule — one domain: mounting it starts what it lists, unmounting undoes all of it
export const catalogModule = createModule("catalog", (module) => {
  // handle — this module answers the findProducts command while it is mounted
  module.handle(findProducts, answerFind);
  // on — run the search for each searchRequested event
  module.on(searchRequested, search);
});
