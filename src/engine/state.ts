import type { GameState, Level, Mechanic, Rules } from "./types";

/** Picks the level's active mechanics from the registry and fixes their hook order (§15.1 rule 2). */
export function createRules(level: Level, registry: Record<string, Mechanic>): Rules {
	const mechanics = level.mechanics
		.filter((id) => id !== "base")
		.map((id) => {
			const mechanic = registry[id];
			if (!mechanic) {
				throw new Error(`Level ${level.id} uses unknown mechanic "${id}"`);
			}
			return mechanic;
		})
		.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
	return { level, mechanics };
}

export function createInitialState(rules: Rules): GameState {
	const { level } = rules;
	const mechState: Record<string, unknown> = {};
	for (const mechanic of rules.mechanics) {
		if (mechanic.initState) {
			mechState[mechanic.id] = mechanic.initState(level, level.mechanicData[mechanic.id]);
		}
	}
	return {
		geckos: level.geckos.map((g) => ({
			id: g.id,
			color: g.color,
			cells: g.cells.map((c) => [c[0], c[1]]),
			saved: false,
		})),
		holes: level.holes.map((h) => ({
			color: h.color,
			cell: [h.cell[0], h.cell[1]],
			capacity: h.capacity ?? 1,
			filled: 0,
		})),
		mechState,
		steps: 0,
		status: "playing",
	};
}

/**
 * Hand-rolled deep copy: much cheaper than structuredClone for the hot path (solver/pathfinding
 * clone thousands of states). Mechanic state values are immutable by contract, so a shallow copy
 * of the record is enough.
 */
export function cloneState(state: GameState): GameState {
	return {
		geckos: state.geckos.map((g) => ({ ...g, cells: g.cells.map((c) => [c[0], c[1]]) })),
		holes: state.holes.map((h) => ({ ...h, cell: [h.cell[0], h.cell[1]] })),
		mechState: { ...state.mechState },
		steps: state.steps,
		status: state.status,
	};
}

/**
 * Stable key of everything that affects future moves. Step counter is deliberately excluded.
 * Compact on purpose (one char per cell): the solver builds and hashes millions of these.
 * Geckos are always in level order and have fixed lengths, so no separators are needed between them.
 */
export function stateKey(rules: Rules, state: GameState): string {
	const width = rules.level.grid.w;
	let key = "";
	for (const gecko of state.geckos) {
		if (gecko.saved) {
			key += "\u0000";
			continue;
		}
		for (const cell of gecko.cells) {
			// +1 keeps index 0 distinct from the "saved" marker.
			key += String.fromCharCode(cell[1] * width + cell[0] + 1);
		}
	}
	for (const hole of state.holes) {
		key += String.fromCharCode(hole.filled);
	}
	for (const m of rules.mechanics) {
		if (m.stateKey && state.mechState[m.id] !== undefined) {
			key += `|${m.id}=${m.stateKey(state.mechState[m.id])}`;
		}
	}
	return key;
}
