import type { Mechanic } from "../engine/types";
import { fragile } from "./fragile";
import { lengths } from "./lengths";
import { lockedHoles } from "./lockedHoles";
import { walls } from "./walls";

export const REGISTRY: Record<string, Mechanic> = {
	fragile: fragile as Mechanic,
	lengths,
	"locked-holes": lockedHoles as Mechanic,
	walls: walls as Mechanic,
};
