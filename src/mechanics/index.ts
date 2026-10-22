import type { Mechanic } from "../engine/types";
import { lengths } from "./lengths";
import { walls } from "./walls";

export const REGISTRY: Record<string, Mechanic> = {
	lengths,
	walls: walls as Mechanic,
};
