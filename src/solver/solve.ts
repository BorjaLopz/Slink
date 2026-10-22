import { DIRECTIONS, manhattan } from "../engine/cell";
import { step } from "../engine/pipeline";
import { stateKey } from "../engine/state";
import type { Direction, GameState, GeckoEnd, Rules } from "../engine/types";
import { MinHeap } from "./minHeap";

export interface SolverMove {
	geckoId: string;
	end: GeckoEnd;
	dir: Direction;
}

export interface SolveOptions {
	maxStates?: number;
	/**
	 * Heuristic weight. 1 = plain A* (optimal minMoves). Above 1 finds a solution much faster but
	 * minMoves becomes an upper bound; good enough to prove solvability.
	 */
	weight?: number;
}

export interface SolveResult {
	solvable: boolean;
	/** Single-cell steps of the solution found; the minimum when weight is 1. Only meaningful when solvable. */
	minMoves: number;
	statesExplored: number;
	/** True when the search hit maxStates before deciding; `solvable: false` is then inconclusive. */
	exhausted: boolean;
	solution: SolverMove[];
}

/**
 * Frontier entries only remember how they were reached; the state is rebuilt when popped.
 * Keeping full states for every queued child made the garbage collector dominate the run.
 */
interface SearchNode {
	g: number;
	key: string;
	parent: ExpandedNode | undefined;
	move: SolverMove | undefined;
}

interface ExpandedNode extends SearchNode {
	state: GameState;
}

const ENDS: readonly GeckoEnd[] = ["head", "tail"];

/**
 * Lower bound of remaining steps: each step moves one end of one gecko by one cell, so the
 * closest end of every unsaved gecko must at least cover its Manhattan distance to a free hole.
 */
export function heuristic(state: GameState): number {
	let total = 0;
	for (const gecko of state.geckos) {
		if (gecko.saved) {
			continue;
		}
		const head = gecko.cells[0];
		const tail = gecko.cells[gecko.cells.length - 1];
		let best = Infinity;
		for (const hole of state.holes) {
			if (hole.color === gecko.color && hole.filled < hole.capacity) {
				best = Math.min(best, manhattan(head, hole.cell), manhattan(tail, hole.cell));
			}
		}
		total += best;
	}
	return total;
}

/** A* over single steps. Optimal with weight 1 because the heuristic is admissible and consistent. */
export function solve(rules: Rules, initial: GameState, { maxStates = 200_000, weight = 1 }: SolveOptions = {}): SolveResult {
	const heap = new MinHeap<SearchNode>();
	const rootKey = stateKey(rules, initial);
	const bestG = new Map<string, number>([[rootKey, 0]]);
	heap.push({ g: 0, key: rootKey, parent: undefined, move: undefined }, weight * heuristic(initial));
	let explored = 0;

	while (heap.size > 0) {
		const entry = heap.pop() as SearchNode;
		if ((bestG.get(entry.key) ?? Infinity) < entry.g) {
			continue;
		}
		const node = materialize(rules, entry, initial);
		if (node.state.status === "won") {
			return { solvable: true, minMoves: node.g, statesExplored: explored, exhausted: false, solution: unwind(node) };
		}
		explored += 1;
		if (explored > maxStates) {
			return { solvable: false, minMoves: 0, statesExplored: explored, exhausted: true, solution: [] };
		}

		for (const gecko of node.state.geckos) {
			if (gecko.saved) {
				continue;
			}
			for (const end of ENDS) {
				for (const dir of DIRECTIONS) {
					const result = step(rules, node.state, gecko.id, end, dir);
					if (!result.ok) {
						continue;
					}
					const g = node.g + 1;
					const key = stateKey(rules, result.state);
					if ((bestG.get(key) ?? Infinity) <= g) {
						continue;
					}
					bestG.set(key, g);
					heap.push({ g, key, parent: node, move: { geckoId: gecko.id, end, dir } }, g + weight * heuristic(result.state));
				}
			}
		}
	}
	return { solvable: false, minMoves: 0, statesExplored: explored, exhausted: false, solution: [] };
}

function materialize(rules: Rules, entry: SearchNode, initial: GameState): ExpandedNode {
	if (!entry.parent || !entry.move) {
		return { ...entry, state: initial };
	}
	const { geckoId, end, dir } = entry.move;
	const result = step(rules, entry.parent.state, geckoId, end, dir);
	if (!result.ok) {
		throw new Error("solver: replaying a recorded move failed; step() is not deterministic");
	}
	return { ...entry, state: result.state };
}

function unwind(node: SearchNode): SolverMove[] {
	const moves: SolverMove[] = [];
	for (let n: SearchNode | undefined = node; n?.move; n = n.parent) {
		moves.push(n.move);
	}
	return moves.reverse();
}
