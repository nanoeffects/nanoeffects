import { createModule } from "nanoeffects/actions";
import { clearAbilities, loadAbilities } from "./ability";
import { loadAbilityTexts } from "./ability-handlers";
import { abilityStore } from "./ability-store";

export const abilityModule = createModule("ability", (module) => {
	const { startLoading, showTexts, stopLoading } = abilityStore.getState();

	// handle — this module does the work of the loadAbilities job while it is mounted
	module.handle(loadAbilities, loadAbilityTexts);

	module.on(loadAbilities.pending, startLoading);
	module.on(loadAbilities.success, showTexts);
	module.on(loadAbilities.fail, stopLoading);
	module.on(loadAbilities.cancel, stopLoading);

	// use — a command that carries its handler: bind it for as long as this module is mounted
	module.use(clearAbilities);
});
