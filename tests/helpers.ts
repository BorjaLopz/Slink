import { createInitialState, createRules } from "../src/engine";
import type { GameState, Level, Mechanic, Rules } from "../src/engine";
import { REGISTRY } from "../src/mechanics";

export function makeLevel(overrides: Partial<Level>): Level {
	return {
		id: 999,
		source: "handcrafted",
		grid: { w: 6, h: 6 },
		holes: [],
		geckos: [],
		mechanics: ["base"],
		mechanicData: {},
		timeLimit: 60,
		stars: { two: 0.3, three: 0.6 },
		...overrides,
	};
}

export function setup(level: Level, registry: Record<string, Mechanic> = REGISTRY): { rules: Rules; state: GameState } {
	const rules = createRules(level, registry);
	return { rules, state: createInitialState(rules) };
}
