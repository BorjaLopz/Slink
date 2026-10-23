import type { Mechanic } from "../engine/types";

/**
 * Variable gecko lengths (2-6). No turn hooks: the engine already handles any length. It exists so
 * the unlock table, the generator and tutorials can treat it like any other mechanic.
 */
export const lengths: Mechanic = {
	id: "lengths",
	priority: 0,
	complexity: 1,
	basic: true,
	name: "Longitudes",
	tutorialHint: "Los lagartos cortos giran en cualquier hueco; los largos necesitan espacio.",
};
