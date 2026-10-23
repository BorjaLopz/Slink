import type { GameState, Rules } from "../engine/types";
import { minParkings } from "./parking";
import { solve } from "./solve";

export interface Proof {
	solvable: boolean;
	/** True when neither search could decide: `solvable: false` is then inconclusive. */
	exhausted: boolean;
}

/**
 * Proves a level solvable with whichever search finds a solution first. The parking search is the one
 * the generator relies on and copes with irreversible mechanics (each leaf doubles A*'s state space);
 * weighted A* covers the rest.
 */
export function proveSolvable(rules: Rules, initial: GameState): Proof {
	let exhausted = false;
	// The budgets change the exploration order, so the generator's own budget comes first: it is the
	// one that found the level's solution in the first place.
	// The generator searched only as deep as the level's tier; same depth, same exploration order.
	const generatorDepth = Math.min(3, rules.level.meta?.tier ?? 3);
	const budgets = [{ ...PARKING_BUDGETS[0], maxDepth: generatorDepth }, ...PARKING_BUDGETS];
	for (const budget of budgets) {
		const parking = minParkings(rules, initial, budget);
		if (Number.isFinite(parking.parkings) && !parking.exhausted) {
			return { solvable: true, exhausted: false };
		}
		exhausted ||= parking.exhausted;
	}
	const result = solve(rules, initial, { weight: 3, maxStates: 100_000 });
	return { solvable: result.solvable, exhausted: result.exhausted && exhausted };
}

const PARKING_BUDGETS = [
	{ maxDepth: 3, maxStates: 3_000, maxDragStates: 100, maxWork: 15_000 },
	{ maxDepth: 4, maxStates: 20_000, maxDragStates: 150, maxWork: 120_000 },
];
