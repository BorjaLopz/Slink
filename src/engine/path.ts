import { DIRECTIONS, cellKey, moveCell, sameCell } from "./cell";
import { createCtx, endCell, step } from "./pipeline";
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
 *
 * With `avoidIrreversible`, steps that change any mechanic state (a leaf breaking...) are skipped,
 * except the one that drops the gecko into its hole. Used for drags the player did not trace cell by
 * cell, so a shortcut never commits them to something they cannot take back.
 */
export function findPath(
	rules: Rules,
	state: GameState,
	geckoId: string,
	end: GeckoEnd,
	target: Cell,
	maxStates = 2000,
	avoidIrreversible = false,
): Direction[] | undefined {
	if (!cellReachable(rules, state, geckoId, target)) {
		return undefined;
	}
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
			if (avoidIrreversible && !gecko.saved && changesMechState(node.state, result.state)) {
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

/** True when a step had irreversible side effects on some mechanic (a leaf broke...). */
export function changesMechState(before: GameState, after: GameState): boolean {
	const keys = new Set([...Object.keys(before.mechState), ...Object.keys(after.mechState)]);
	// Mechanic state is immutable (replaced on change), so identity is enough.
	return [...keys].some((k) => before.mechState[k] !== after.mechState[k]);
}

/**
 * Cheap necessary condition for findPath: can `target` be reached at all by a flood fill over cells?
 * Other geckos stay put while one gecko moves, so they are obstacles, and so is any cell a mechanic
 * vetoes now (unless its veto can lift mid-drag, see Mechanic.dynamicVeto). The solver calls findPath
 * for every gecko after every drag, and most of those calls are hopeless; this skips their full BFS.
 */
function cellReachable(rules: Rules, state: GameState, geckoId: string, target: Cell): boolean {
	const gecko = state.geckos.find((g) => g.id === geckoId);
	if (!gecko) {
		return false;
	}
	const ctx = createCtx(rules, state, []);
	const vetoes = rules.mechanics.filter((m) => m.canEnter && !m.dynamicVeto);
	const own = new Set(gecko.cells.map(cellKey));
	const passable = (cell: Cell): boolean => {
		if (!ctx.inBounds(cell)) {
			return false;
		}
		if (!own.has(cellKey(cell)) && ctx.geckoAt(cell)) {
			return false;
		}
		const hole = ctx.holeAt(cell);
		if (hole && hole.filled < hole.capacity && hole.color !== gecko.color) {
			return false;
		}
		return vetoes.every((m) => m.canEnter?.(ctx, gecko, cell) !== false);
	};
	const seen = new Set(gecko.cells.map(cellKey));
	const queue: Cell[] = [...gecko.cells];
	for (let i = 0; i < queue.length; i++) {
		if (sameCell(queue[i], target)) {
			return true;
		}
		for (const dir of DIRECTIONS) {
			const next = moveCell(queue[i], dir);
			const key = cellKey(next);
			if (!seen.has(key) && passable(next)) {
				seen.add(key);
				queue.push(next);
			}
		}
	}
	return false;
}
