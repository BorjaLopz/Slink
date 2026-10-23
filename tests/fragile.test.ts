import { describe, expect, it } from "vitest";
import { findPath, stateKey, step, validateLevel } from "../src/engine";
import type { Cell, GameState, Level, Rules } from "../src/engine";
import { Rng } from "../src/generator/rng";
import { fragile } from "../src/mechanics/fragile";
import { REGISTRY } from "../src/mechanics";
import { solve } from "../src/solver/solve";
import { makeLevel, setup } from "./helpers";

/** One-row corridor: a 2-long green gecko heading right, leaves wherever the test says. */
function corridor(leaves: Cell[], extra: Partial<Level> = {}): Level {
	return makeLevel({
		grid: { w: 6, h: 1 },
		geckos: [{ id: "g", color: "green", cells: [[1, 0], [0, 0]] }],
		holes: [{ color: "green", cell: [5, 0] }],
		mechanics: ["base", "fragile"],
		mechanicData: { fragile: leaves },
		...extra,
	});
}

function walk(rules: Rules, state: GameState, moves: ["head" | "tail", "up" | "down" | "left" | "right"][]): GameState {
	return moves.reduce((s, [end, dir]) => {
		const result = step(rules, s, "g", end, dir);
		if (!result.ok) {
			throw new Error(`step ${end} ${dir} failed: ${result.reason}`);
		}
		return result.state;
	}, state);
}

describe("fragile", () => {
	it("holds while any part of the gecko is on it and breaks when the tail leaves", () => {
		const { rules, state } = setup(corridor([[2, 0]]));
		const onLeaf = walk(rules, state, [["head", "right"], ["head", "right"]]);
		expect(onLeaf.mechState.fragile).toBe(0);
		const past = walk(rules, onLeaf, [["head", "right"]]);
		expect(past.mechState.fragile).toBe(1);
		// Broken leaf is a wall now: going back is impossible.
		expect(step(rules, past, "g", "tail", "left").ok).toBe(false);
	});

	it("breaks when the gecko steps on it and backs off: it was used", () => {
		const { rules, state } = setup(corridor([[2, 0]]));
		const back = walk(rules, state, [["head", "right"], ["tail", "left"]]);
		expect(back.mechState.fragile).toBe(1);
	});

	it("never mutates the previous state, so undo restores the leaf", () => {
		const { rules, state } = setup(corridor([[2, 0]]));
		const before = walk(rules, state, [["head", "right"], ["head", "right"]]);
		walk(rules, before, [["head", "right"]]);
		expect(before.mechState.fragile).toBe(0);
	});

	it("is part of the state key", () => {
		const { rules, state } = setup(corridor([[2, 0]]));
		const back = walk(rules, state, [["head", "right"], ["tail", "left"]]);
		// Same gecko cells as the start, only the leaf differs.
		expect(back.geckos).toEqual(state.geckos);
		expect(stateKey(rules, back)).not.toBe(stateKey(rules, state));
	});

	it("breaks the leaves under a gecko that drops into its hole", () => {
		const level = corridor([[3, 0]], {
			geckos: [{ id: "g", color: "green", cells: [[2, 0], [1, 0]] }],
			holes: [{ color: "green", cell: [4, 0] }],
		});
		const { rules, state } = setup(level);
		const saved = walk(rules, state, [["head", "right"], ["head", "right"]]);
		expect(saved.status).toBe("won");
		expect(saved.mechState.fragile).toBe(1);
	});

	it("holds when a long gecko chases its own tail through it", () => {
		const level = makeLevel({
			grid: { w: 3, h: 3 },
			geckos: [{ id: "g", color: "green", cells: [[0, 0], [1, 0], [1, 1], [0, 1]] }],
			mechanics: ["base", "fragile"],
			mechanicData: { fragile: [[0, 1]] },
		});
		const { rules, state } = setup(level);
		const looped = walk(rules, state, [["head", "down"]]);
		expect(looped.mechState.fragile).toBe(0);
	});

	it("long drags never break leaves but may stop on one", () => {
		const { rules, state } = setup(corridor([[2, 0]]));
		expect(findPath(rules, state, "g", "head", [5, 0])).toBeDefined();
		expect(findPath(rules, state, "g", "head", [5, 0], 2000, true)).toBeUndefined();
		expect(findPath(rules, state, "g", "head", [2, 0], 2000, true)).toEqual(["right"]);
	});

	it("validates leaf placement", () => {
		const bad = corridor([[1, 0], [9, 0], [3, 0], [3, 0]]);
		const errors = validateLevel(bad, REGISTRY).join("\n");
		expect(errors).toContain("1,0 overlaps");
		expect(errors).toContain("9,0 out of bounds");
		expect(errors).toContain("duplicate leaf 3,0");
		expect(validateLevel(corridor([[3, 0]]), REGISTRY)).toEqual([]);
	});

	it("withoutMechanic turns leaves into walls", () => {
		const level = corridor([[3, 0]]);
		const blocked = fragile.withoutMechanic?.(level, [[3, 0]]) as Level;
		expect(blocked.mechanics).toEqual(["base", "walls"]);
		expect(blocked.mechanicData).toEqual({ walls: [[3, 0]] });
		const { rules, state } = setup(level);
		expect(solve(rules, state).solvable).toBe(true);
		const without = setup(blocked);
		expect(solve(without.rules, without.state).solvable).toBe(false);
	});

	it("populate closes the gate a gecko must cross, so the leaves cannot be avoided", () => {
		// A wall across the board with a single gap at (3, 2): the only way from the gecko to its hole.
		const level = makeLevel({
			grid: { w: 5, h: 5 },
			geckos: [{ id: "g", color: "green", cells: [[0, 0], [1, 0]] }],
			holes: [{ color: "green", cell: [4, 4] }],
			mechanics: ["base", "walls", "fragile"],
			mechanicData: { walls: [[0, 2], [1, 2], [2, 2], [4, 2]] },
		});
		const leaves = fragile.populate?.(new Rng(1), level, 0) as Cell[];
		// Any single-cell gate works: the gap itself or the cell right before it.
		expect(leaves.some((c) => c[0] === 3 && (c[1] === 1 || c[1] === 2 || c[1] === 3))).toBe(true);
		const blocked = setup(fragile.withoutMechanic?.(level, leaves) as Level);
		expect(solve(blocked.rules, blocked.state).solvable).toBe(false);
	});

	it("populate puts leaves on free cells along routes home, deterministically", () => {
		const level = makeLevel({
			grid: { w: 5, h: 5 },
			geckos: [{ id: "g", color: "green", cells: [[0, 0], [0, 1]] }],
			holes: [{ color: "green", cell: [4, 4] }],
			mechanics: ["base", "fragile"],
		});
		const a = fragile.populate?.(new Rng(7), level, 1) as Cell[];
		const b = fragile.populate?.(new Rng(7), level, 1) as Cell[];
		expect(a).toEqual(b);
		expect(a.length).toBeGreaterThan(0);
		expect(validateLevel({ ...level, mechanicData: { fragile: a } }, REGISTRY)).toEqual([]);
	});
});
