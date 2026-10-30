import { createModule } from "nanoeffects/actions";
import { search } from "./catalog-handlers";
import { findProducts, searchRequested } from "./catalog";

// createModule — one domain: mounting it starts what it lists, unmounting undoes all of it
export const catalogModule = createModule("catalog", (module) => {
  // use — a command that carries its handler: bind it for as long as this module is mounted
  module.use(findProducts);
  // on — run the search for each searchRequested event
  module.on(searchRequested, search);
});
