import { DIRECTIONS } from "../engine/cell";
import { findPath } from "../engine/path";
import { step } from "../engine/pipeline";
import { stateKey } from "../engine/state";
import type { GameState, GeckoEnd, Rules } from "../engine/types";

export interface ParkingResult {
	/** Minimum number of "parking" drags: moving a gecko somewhere that is not its hole. */
	parkings: number;
	/** True when the search hit its limits; `parkings` is then a lower bound. */
	exhausted: boolean;
	/** Single-cell steps of the solution found (an upper bound of minMoves). 0 when none was found. */
	steps: number;
}

export interface ParkingOptions {
	maxDepth?: number;
	maxStates?: number;
	/** Cap on configurations explored per single drag. */
	maxDragStates?: number;
	/**
	 * Deterministic work budget (drag targets + home attempts). Unsolvable or huge levels would
	 * otherwise run for minutes; counting work instead of time keeps the generator reproducible.
	 */
	maxWork?: number;
}

const ENDS: readonly GeckoEnd[] = ["head", "tail"];

/**
 * Difficulty as a player feels it. Sending a gecko home never hurts (it frees cells and its hole
 * becomes floor), so those drags are free and applied greedily. What makes a level hard is how many
 * times you must first move a gecko out of the way. This counts the minimum number of such drags
 * with a breadth-first search over "parking" moves.
 */
export function minParkings(rules: Rules, initial: GameState, options: ParkingOptions = {}): ParkingResult {
	const { maxDepth = 4, maxStates = 6_000, maxDragStates = 150, maxWork = 40_000 } = options;
	let work = 0;
	const settle = (state: GameState): GameState => {
		work += state.geckos.length;
		return sendHome(rules, state);
	};
	const start = settle(initial);
	if (start.status === "won") {
		return { parkings: 0, exhausted: false, steps: start.steps - initial.steps };
	}
	const seen = new Set([stateKey(rules, start)]);
	let frontier = [start];

	for (let depth = 1; depth <= maxDepth; depth++) {
		const next: GameState[] = [];
		for (const state of frontier) {
			for (const gecko of state.geckos) {
				if (gecko.saved) {
					continue;
				}
				for (const end of ENDS) {
					for (const parked of dragTargets(rules, state, gecko.id, end, maxDragStates)) {
						if (work > maxWork) {
							return { parkings: depth, exhausted: true, steps: 0 };
						}
						const settled = settle(parked);
						if (settled.status === "won") {
							return { parkings: depth, exhausted: false, steps: settled.steps - initial.steps };
						}
						const key = stateKey(rules, settled);
						if (!seen.has(key)) {
							seen.add(key);
							next.push(settled);
							if (seen.size > maxStates) {
								return { parkings: depth + 1, exhausted: true, steps: 0 };
							}
						}
					}
				}
			}
		}
		if (next.length === 0) {
			return { parkings: Infinity, exhausted: false, steps: 0 };
		}
		frontier = next;
	}
	return { parkings: maxDepth + 1, exhausted: true, steps: 0 };
}

/** Repeatedly sends home every gecko that can reach a free hole of its color with everyone else still. */
function sendHome(rules: Rules, state: GameState): GameState {
	let current = state;
	let progressed = true;
	while (progressed && current.status === "playing") {
		progressed = false;
		for (const gecko of current.geckos) {
			if (gecko.saved) {
				continue;
			}
			const holes = current.holes.filter((h) => h.color === gecko.color && h.filled < h.capacity);
			for (const hole of holes) {
				const route = ENDS.map((end) => ({ end, dirs: findPath(rules, current, gecko.id, end, hole.cell, 600) })).find((r) => r.dirs);
				if (!route?.dirs) {
					continue;
				}
				for (const dir of route.dirs) {
					const result = step(rules, current, gecko.id, route.end, dir);
					if (!result.ok) {
						break;
					}
					current = result.state;
				}
				progressed = true;
				break;
			}
		}
	}
	return current;
}

/** Every distinct configuration one end of a gecko can be dragged to (excluding where it is). */
export function dragTargets(rules: Rules, state: GameState, geckoId: string, end: GeckoEnd, maxStates: number): GameState[] {
	const seen = new Set([stateKey(rules, state)]);
	const queue = [state];
	const targets: GameState[] = [];
	for (let i = 0; i < queue.length && seen.size < maxStates; i++) {
		for (const dir of DIRECTIONS) {
			const result = step(rules, queue[i], geckoId, end, dir);
			if (!result.ok) {
				continue;
			}
			const gecko = result.state.geckos.find((g) => g.id === geckoId);
			// Drags that drop the gecko into its hole are "home" moves, handled by sendHome.
			if (!gecko || gecko.saved) {
				continue;
			}
			const key = stateKey(rules, result.state);
			if (!seen.has(key)) {
				seen.add(key);
				queue.push(result.state);
				targets.push(result.state);
			}
		}
	}
	return targets;
}

