import { describe, expect, it } from "vitest";
import { findPath, step, stateKey, validateLevel } from "../src/engine";
import type { GameEvent, GameState, Mechanic, StepResult } from "../src/engine";
import { REGISTRY } from "../src/mechanics";
import { solve } from "../src/solver/solve";
import { makeLevel, setup } from "./helpers";

function expectOk(result: StepResult): GameState {
	if (!result.ok) {
		throw new Error(`expected ok step, got "${result.reason}"`);
	}
	return result.state;
}

const line = makeLevel({
	geckos: [{ id: "g", color: "green", cells: [[2, 2], [2, 3], [2, 4]] }],
	holes: [{ color: "green", cell: [5, 0] }],
});

describe("movement", () => {
	it("moves the head and the body follows the trail", () => {
		const { rules, state } = setup(line);
		const next = expectOk(step(rules, state, "g", "head", "up"));
		expect(next.geckos[0].cells).toEqual([[2, 1], [2, 2], [2, 3]]);
		expect(next.steps).toBe(1);
	});

	it("moves from the tail end too, keeping cell orientation", () => {
		const { rules, state } = setup(line);
		const next = expectOk(step(rules, state, "g", "tail", "right"));
		expect(next.geckos[0].cells).toEqual([[2, 3], [2, 4], [3, 4]]);
	});

	it("never mutates the input state", () => {
		const { rules, state } = setup(line);
		const snapshot = JSON.stringify(state);
		step(rules, state, "g", "head", "up");
		expect(JSON.stringify(state)).toBe(snapshot);
	});

	it("blocks leaving the board", () => {
		const { rules, state } = setup(makeLevel({ geckos: [{ id: "g", color: "green", cells: [[0, 0], [1, 0]] }] }));
		expect(step(rules, state, "g", "head", "left")).toEqual({ ok: false, reason: "blocked" });
		expect(step(rules, state, "g", "head", "up")).toEqual({ ok: false, reason: "blocked" });
	});

	it("blocks reversing into the neck", () => {
		const { rules, state } = setup(line);
		expect(step(rules, state, "g", "head", "down")).toEqual({ ok: false, reason: "blocked" });
	});

	it("blocks the neck of a 2-long gecko (no in-place flip)", () => {
		const { rules, state } = setup(makeLevel({ geckos: [{ id: "g", color: "green", cells: [[1, 1], [2, 1]] }] }));
		expect(step(rules, state, "g", "head", "right").ok).toBe(false);
	});

	it("allows entering the cell the tail is vacating", () => {
		const loop = makeLevel({ geckos: [{ id: "g", color: "green", cells: [[1, 1], [2, 1], [2, 2], [1, 2]] }] });
		const { rules, state } = setup(loop);
		const next = expectOk(step(rules, state, "g", "head", "down"));
		expect(next.geckos[0].cells).toEqual([[1, 2], [1, 1], [2, 1], [2, 2]]);
	});

	it("blocks other geckos", () => {
		const level = makeLevel({
			geckos: [
				{ id: "a", color: "green", cells: [[1, 1], [1, 2]] },
				{ id: "b", color: "blue", cells: [[1, 0], [2, 0]] },
			],
		});
		const { rules, state } = setup(level);
		expect(step(rules, state, "a", "head", "up").ok).toBe(false);
	});
});

describe("holes", () => {
	const level = makeLevel({
		geckos: [
			{ id: "a", color: "green", cells: [[1, 2], [1, 3]] },
			{ id: "b", color: "blue", cells: [[3, 2], [3, 3]] },
		],
		holes: [
			{ color: "green", cell: [1, 1] },
			{ color: "blue", cell: [2, 2] },
		],
	});

	it("treats a hole of another color as a wall", () => {
		const { rules, state } = setup(level);
		expect(step(rules, state, "a", "head", "right").ok).toBe(false);
	});

	it("swallows a gecko entering its own hole and emits hole:filled", () => {
		const { rules, state } = setup(level);
		const result = step(rules, state, "a", "head", "up");
		const next = expectOk(result);
		expect(next.geckos[0].saved).toBe(true);
		expect(next.holes[0].filled).toBe(1);
		expect(result.ok && result.events.map((e) => e.type)).toContain("hole:filled");
		expect(next.status).toBe("playing");
	});

	it("wins when every gecko is saved, and refuses further steps", () => {
		const { rules, state } = setup(level);
		const s1 = expectOk(step(rules, state, "a", "head", "up"));
		const result = step(rules, s1, "b", "head", "left");
		const s2 = expectOk(result);
		expect(s2.status).toBe("won");
		expect(result.ok && result.events.at(-1)).toEqual({ type: "level:won" });
		expect(step(rules, s2, "b", "head", "up")).toEqual({ ok: false, reason: "not-playing" });
	});

	it("frees the board once a gecko is saved", () => {
		const { rules, state } = setup(level);
		const s1 = expectOk(step(rules, state, "a", "head", "up"));
		expect(s1.geckos[0].cells.length).toBe(2);
		// Blue can now pass through where green's body used to be.
		const s2 = expectOk(step(rules, s1, "b", "tail", "left"));
		const s3 = expectOk(step(rules, s2, "b", "tail", "left"));
		expect(s3.geckos[1].cells.at(-1)).toEqual([1, 3]);
	});

	it("turns a full hole into plain floor that any gecko can cross", () => {
		const level = makeLevel({
			geckos: [
				{ id: "a", color: "green", cells: [[1, 2], [1, 3]] },
				{ id: "b", color: "green", cells: [[0, 0], [0, 1]] },
				{ id: "c", color: "blue", cells: [[2, 0], [3, 0]] },
			],
			holes: [{ color: "green", cell: [1, 1] }, { color: "green", cell: [5, 5] }, { color: "blue", cell: [5, 0] }],
		});
		const { rules, state } = setup(level);
		// Open: blue cannot use the green hole as a shortcut.
		const blocked = expectOk(step(rules, state, "c", "head", "down"));
		expect(step(rules, blocked, "c", "head", "left").ok).toBe(false);

		const s1 = expectOk(step(rules, state, "a", "head", "up"));
		// Full: green b walks over it without being swallowed, blue crosses it too.
		const s2 = expectOk(step(rules, s1, "b", "head", "right"));
		const s3 = expectOk(step(rules, s2, "b", "head", "down"));
		expect(s3.geckos[1].cells[0]).toEqual([1, 1]);
		expect(s3.geckos[1].saved).toBe(false);
		expect(s3.holes[0].filled).toBe(1);
		// Move green fully off the old hole, then blue steps onto it.
		const s4 = expectOk(step(rules, expectOk(step(rules, s3, "b", "head", "down")), "b", "head", "down"));
		const s5 = expectOk(step(rules, s4, "c", "head", "down"));
		expect(step(rules, s5, "c", "head", "left").ok).toBe(true);
	});
});

describe("mechanic pipeline", () => {
	it("walls veto movement", () => {
		const level = makeLevel({
			geckos: [{ id: "g", color: "green", cells: [[2, 2], [2, 3]] }],
			mechanics: ["base", "walls"],
			mechanicData: { walls: [[2, 1]] },
		});
		const { rules, state } = setup(level);
		expect(step(rules, state, "g", "head", "up").ok).toBe(false);
		expect(step(rules, state, "g", "head", "left").ok).toBe(true);
	});

	it("runs hooks in priority order, then id order, and dispatches events", () => {
		const calls: string[] = [];
		const make = (id: string, priority: number): Mechanic => ({
			id,
			priority,
			complexity: 1,
			onEnter: () => {
				calls.push(id);
			},
		});
		const seen: GameEvent["type"][] = [];
		const listener: Mechanic = {
			id: "listener",
			priority: 9,
			complexity: 1,
			onEvent: (_ctx, event) => {
				seen.push(event.type);
			},
		};
		const registry = { b: make("b", 1), a: make("a", 1), z: make("z", 0), listener };
		const level = makeLevel({
			geckos: [{ id: "g", color: "green", cells: [[2, 2], [2, 3]] }],
			mechanics: ["base", "b", "a", "z", "listener"],
		});
		const { rules, state } = setup(level, registry);
		expectOk(step(rules, state, "g", "head", "up"));
		expect(calls).toEqual(["z", "a", "b"]);
		expect(seen).toEqual(["gecko:left", "gecko:entered", "gecko:moved"]);
	});

	it("applies redirect before canEnter", () => {
		const teleport: Mechanic = {
			id: "teleport",
			priority: 0,
			complexity: 1,
			redirect: (_ctx, _gecko, _from, to) => (to[0] === 2 && to[1] === 1 ? [4, 4] : to),
		};
		const level = makeLevel({
			geckos: [{ id: "g", color: "green", cells: [[2, 2], [2, 3]] }],
			mechanics: ["base", "teleport"],
		});
		const { rules, state } = setup(level, { teleport });
		expect(expectOk(step(rules, state, "g", "head", "up")).geckos[0].cells[0]).toEqual([4, 4]);
	});

	it("loops afterMove until stable and fails loudly when it never stabilizes", () => {
		const spinner: Mechanic<unknown, { n: number }> = {
			id: "spinner",
			priority: 0,
			complexity: 1,
			initState: () => ({ n: 0 }),
			stateKey: (s) => String(s.n),
			afterMove: (ctx) => {
				(ctx.state.mechState.spinner as { n: number }).n += 1;
			},
		};
		const level = makeLevel({
			geckos: [{ id: "g", color: "green", cells: [[2, 2], [2, 3]] }],
			mechanics: ["base", "spinner"],
		});
		const { rules, state } = setup(level, { spinner: spinner as Mechanic });
		expect(() => step(rules, state, "g", "head", "up")).toThrow(/did not stabilize/);
	});

	it("includes mechanic state in the state key", () => {
		const counter: Mechanic<unknown, number> = {
			id: "counter",
			priority: 0,
			complexity: 1,
			initState: () => 0,
			stateKey: (s) => String(s),
		};
		const level = makeLevel({ geckos: [{ id: "g", color: "green", cells: [[2, 2], [2, 3]] }], mechanics: ["counter"] });
		const { rules, state } = setup(level, { counter: counter as Mechanic });
		const other = { ...state, mechState: { counter: 1 } };
		expect(stateKey(rules, state)).not.toBe(stateKey(rules, other));
	});
});

describe("findPath", () => {
	it("routes around obstacles taking the moving body into account", () => {
		const level = makeLevel({
			geckos: [{ id: "g", color: "green", cells: [[0, 2], [0, 3], [0, 4]] }],
			mechanics: ["base", "walls"],
			mechanicData: { walls: [[1, 1], [1, 2], [1, 3]] },
		});
		const { rules, state } = setup(level);
		const path = findPath(rules, state, "g", "head", [2, 2]);
		expect(path).toEqual(["up", "up", "right", "right", "down", "down"]);
	});

	it("returns undefined when unreachable", () => {
		const level = makeLevel({
			grid: { w: 3, h: 3 },
			geckos: [{ id: "g", color: "green", cells: [[0, 0], [0, 1]] }],
			mechanics: ["base", "walls"],
			mechanicData: { walls: [[1, 0], [1, 1], [1, 2]] },
		});
		const { rules, state } = setup(level);
		expect(findPath(rules, state, "g", "head", [2, 2])).toBeUndefined();
	});
});

describe("validateLevel", () => {
	it("reports broken geckos, overlaps, missing holes and bad walls", () => {
		const level = makeLevel({
			geckos: [
				{ id: "g", color: "green", cells: [[0, 0], [2, 0]] },
				{ id: "g", color: "blue", cells: [[2, 0], [2, 1]] },
			],
			holes: [{ color: "green", cell: [9, 9] }],
			mechanics: ["base", "walls", "nope"],
			mechanicData: { walls: [[2, 1]] },
		});
		const errors = validateLevel(level, REGISTRY).join("\n");
		expect(errors).toMatch(/not contiguous/);
		expect(errors).toMatch(/duplicate gecko id/);
		expect(errors).toMatch(/overlaps g/);
		expect(errors).toMatch(/hole 9,9 out of bounds/);
		expect(errors).toMatch(/only 0 blue hole capacity/);
		expect(errors).toMatch(/unknown mechanic "nope"/);
		expect(errors).toMatch(/walls: 2,1 overlaps/);
	});
});

describe("solver", () => {
	it("finds the optimal solution with weight 1 and replays to a win", () => {
		const level = makeLevel({
			grid: { w: 5, h: 6 },
			geckos: [
				{ id: "g1", color: "green", cells: [[0, 2], [1, 2], [2, 2]] },
				{ id: "g2", color: "blue", cells: [[3, 1], [3, 2], [3, 3]] },
			],
			holes: [{ color: "green", cell: [4, 2] }, { color: "blue", cell: [3, 5] }],
		});
		const { rules, state } = setup(level);
		const result = solve(rules, state);
		expect(result.solvable).toBe(true);
		expect(result.minMoves).toBe(4);
		let current = state;
		for (const move of result.solution) {
			current = expectOk(step(rules, current, move.geckoId, move.end, move.dir));
		}
		expect(current.status).toBe("won");
	});

	it("reports unsolvable levels", () => {
		const level = makeLevel({
			grid: { w: 4, h: 3 },
			geckos: [{ id: "g", color: "green", cells: [[0, 0], [0, 1]] }],
			holes: [{ color: "green", cell: [3, 2] }],
			mechanics: ["base", "walls"],
			mechanicData: { walls: [[1, 0], [1, 1], [1, 2]] },
		});
		const { rules, state } = setup(level);
		expect(solve(rules, state)).toMatchObject({ solvable: false, exhausted: false });
	});
});
