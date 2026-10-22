import { DIRECTIONS, sameCell } from "./cell";
import { endCell, step } from "./pipeline";
import { stateKey } from "./state";
import type { Cell, Direction, GameState, GeckoEnd, Rules } from "./types";

interface Node {
	state: GameState;
	dirs: Direction[];
}

/**
 * Shortest sequence of steps that brings one end of a gecko to `target` (or into a hole there).
 * BFS runs through the real pipeline, so the body's movement and every mechanic are accounted for.
 * Returns undefined when unreachable within the search budget.
 */
export function findPath(
	rules: Rules,
	state: GameState,
	geckoId: string,
	end: GeckoEnd,
	target: Cell,
	maxStates = 2000,
): Direction[] | undefined {
	const queue: Node[] = [{ state, dirs: [] }];
	const seen = new Set<string>([stateKey(rules, state)]);

	for (let i = 0; i < queue.length && seen.size <= maxStates; i++) {
		const node = queue[i];
		for (const dir of DIRECTIONS) {
			const result = step(rules, node.state, geckoId, end, dir);
			if (!result.ok) {
				continue;
			}
			const gecko = result.state.geckos.find((g) => g.id === geckoId);
			const dirs = [...node.dirs, dir];
			if (!gecko) {
				continue;
			}
			// A saved gecko keeps its last cells, so dropping into a hole at `target` counts as arriving.
			if (sameCell(endCell(gecko, end), target)) {
				return dirs;
			}
			if (gecko.saved) {
				continue;
			}
			const key = stateKey(rules, result.state);
			if (!seen.has(key)) {
				seen.add(key);
				queue.push({ state: result.state, dirs });
			}
		}
	}
	return undefined;
}
